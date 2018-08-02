'use strict'; // 아래의 library 다운을 받아야함. 실행 및 확인은 postman를 통해서 진행
var CryptoJS = require("crypto-js"); // transaction 생성 및 varification 없음
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

class Block {

    constructor(index, previousHash, timestamp, data, hash, nonce, targetvalue) {

        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
        this.nonce = nonce;
        this.targetvalue = targetvalue;
        this.tx_set = [];
        this.merkletree = [];
        this.root = "";
    }
}

var memory_pool = [{ "sender": "a", "reciver": "b", "amount": 100 }, { "sender": "b", "reciver": "c", "amount": 150 }, { "sender": "baa", "reciver": "c", "amount": 150 }, { "sender": "ab", "reciver": "c", "amount": 150 }]; // memory_pool add

var sockets = [];

var MessageType = {

    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2

};

var blockchain = [];

var initHttpServer = () => { // 통신 부분 중요함. 데이터는 json 형식에 의존함.
    var app = express(); // Http 통신
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain))); // show all blockchain

    app.post('/setGenesis', (req, res) => {  // gensis block setting
        
        var a = blockchain.length;
        console.log(JSON.stringify(a));
        if(a != 0) console.log("gensis block exists");
        else{
            var currentTimestamp = new Date().getTime() / 1000;
            
            var new_block = new Block(a, "0", 0, req.body.data, "", 0, "0AAA");

            var blockHash = calculateHashForBlock(new_block);

            new_block.hash = blockHash.toString();
            
            blockchain.push(new_block);
        }
        res.send(JSON.stringify(blockchain)); 
    }); 

    app.post('/mineBlock', (req, res) => { // mining block

        /*memory_pool = [{"sender" : "a","reciver" : "b","amount" : 100}];   // temporarily set memory pool
        memory_pool.push({"sender" : "b","reciver" : "c","amount" : 150});*/

        var newBlock = generateNextBlock(req.body.data, memory_pool); // Using req.body.data for labeling block

        console.log(JSON.stringify(memory_pool));

        addBlock(newBlock);
        broadcast(responseLatestMsg());
        console.log('block added: ' + JSON.stringify(newBlock));
        res.send();

    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};


var initP2PServer = () => { // Websocket
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);

};

var initConnection = (ws) => {// Websocket
    console.log('hello 3001111111111111111');
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

// 블록 생성 부분 //
var generateNextBlock = (blockData, m_pool) => {

    m_pool.unshift({"sender" : "X", "reieciver" : "A", "amount" : 10}); // add coinbase

    var previousBlock = getLatestBlock();

    var nextIndex = previousBlock.index + 1;

    var nextTimestamp = new Date().getTime() / 1000;
    
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);

    var new_block = new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash, 0, "0AAA");

    var transaction_num = 0;

    var block_transactions = [];

    while(transaction_num <= 2 && m_pool.length != 0) { // assume block size is 3 transaction

        transaction_num += 1;

        var new_transaction = m_pool.shift();

        block_transactions.push(new_transaction);

    }


    new_block.tx_set = block_transactions;

    makemerkletree(new_block, new_block.tx_set);

    ProofofWork(new_block);
    
   // console.log(JSON.stringify(memory_pool));

    return new_block;

};

var makemerkletree = (block, block_Transactions) => { // make merkle tree node's value

    var index_s = 0;

    var index_e = 0;

    /*var data = block_Transactions[1];
    
    var strinaaaaa = JSON.stringify(data);

    console.log(data);

    console.log(strinaaaaa);

    console.log((block_Transactions[1]).join());*/

    for (var i in block_Transactions) {

        var data = block_Transactions[i];

        var transaction_string = JSON.stringify(data);

        var hash_value = CryptoJS.SHA256(transaction_string).toString();
        console.log(hash_value);
        block.merkletree.push(hash_value);
    }
    
    index_s = 0;
    index_e = block_Transactions.length;

    while(index_s + 1 != index_e){

        for( var i = index_s; i < index_e; i=i+2){
            if(i + 1 < index_e){
                var hash_value = CryptoJS.SHA256(block.merkletree[i] + block.merkletree[i + 1]).toString();
                block.merkletree.push(hash_value);
            }
            else{
                var hash_value = CryptoJS.SHA256(block.merkletree[i]).toString();
                block.merkletree.push(hash_value);
            }
        }

      //  console.log(index_s);
      //  console.log(index_e);

        index_s = index_e;
        index_e = block.merkletree.length;

    }

    block.root = block.merkletree[index_s];
}

var ProofofWork = (block) => { // Proof of Work 완료

    var hashvalue;
    while(1){

        hashvalue = CryptoJS.SHA256(block.root + (block.index).toString() + block.data + (block.nonce).toString()).toString();

        var value_1 = hashvalue.substring(0,3);

        if(value_1 < block.targetvalue) break;

        block.nonce += 1;

    }

}
var calculateHashForBlock = (block) => {

    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);

};

var calculateHash = (index, previousHash, timestamp, data) => {

    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();

};

var addBlock = (newBlock) => {

    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }

};

var isValidNewBlock = (newBlock, previousBlock) => { // Block transaction verification process X
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = (message) => { // event process
    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than current blockchain. Do nothing');
    }
};

var replaceChain = (newBlocks) => { // Block reorganization, transaction verification X
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid');
    }
};

var isValidChain = (blockchainToValidate) => { // Optimazation
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();