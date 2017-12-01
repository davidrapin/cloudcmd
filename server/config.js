'use strict';

const DIR_SERVER = __dirname + '/';
const DIR_COMMON = '../common/';
const DIR = DIR_SERVER + '../';

const path = require('path');
const fs = require('fs');

const exit = require(DIR_SERVER + 'exit');
const CloudFunc = require(DIR_COMMON + 'cloudfunc');

const fullstore = require('fullstore/legacy');
const currify = require('currify/legacy');
const wraptile = require('wraptile/legacy');
const squad = require('squad');
const promisify = require('es6-promisify');
const pullout = promisify(require('pullout/legacy'));
const ponse = require('ponse');
const jonny = require('jonny');
const jju = require('jju');
const writejson = require('writejson');
const tryCatch = require('try-catch');
const exec = require('execon');
const criton = require('criton');
const HOME = require('os-homedir')();

const manageConfig = squad(traverse, cryptoPass);
const save = promisify(_save);
const swap = currify((f, a, b) => f(b, a));

const sendError = swap(ponse.sendError);
const send = swap(ponse.send);
const formatMsg = currify(CloudFunc.formatMsg);

const apiURL = CloudFunc.apiURL;

const ConfigPath = path.join(DIR, 'json/config.json');
const ConfigHome = path.join(HOME, '.cloudcmd.json');

const readjsonSync = (name) => {
    return jju.parse(fs.readFileSync(name, 'utf8'), {
        mode: 'json'
    });
};

const rootConfig = readjsonSync(ConfigPath);
const key = (a) => Object.keys(a).pop();

let configHome;
const error = tryCatch(() => {
    configHome = readjsonSync(ConfigHome);
});

if (error && error.code !== 'ENOENT')
    exit(`cloudcmd --config ${ConfigHome}: ${error.message}`);

const config = Object.assign({}, rootConfig, configHome);

module.exports          = manage;
module.exports.save     = _save;
module.exports.middle   = middle;
module.exports.listen   = (socket, authCheck) => {
    check(socket, authCheck);
    
    if (!manage('configDialog'))
        return middle;
    
    listen(socket, authCheck);
    
    return middle;
};

function manage(key, value) {
    if (!key)
        return;
    
    if (key === '*')
        return config;
    
    if (value === undefined)
        return config[key];
    
    config[key] = value;
}

function _save(callback) {
    writejson(ConfigHome, config, callback);
}

function listen(sock, authCheck) {
    const prefix = manage('prefix');
    
    sock.of(prefix + '/config')
        .on('connection', (socket) => {
            const connect = exec.with(connection, socket);
            
            exec.if(!manage('auth'), connect, (fn) => {
                authCheck(socket, fn);
            });
        });
}

function connection(socket) {
    socket.emit('config', config);
    
    socket.on('message', (json) => {
        if (typeof json !== 'object')
            return socket.emit('err', 'Error: Wrong data type!');
        
        manageConfig(json);
        
        save().then(() => {
            const data = CloudFunc.formatMsg('config', key(json));
            socket.broadcast.send(json);
            socket.send(json);
            socket.emit('log', data);
        }).catch((e) => {
            socket.emit('err', e.message);
        });
    });
}

function middle(req, res, next) {
    const noConfigDialog = !manage('configDialog');
    
    if (req.url !== apiURL + '/config')
        return next();
    
    switch(req.method) {
    case 'GET':
        get(req, res, next);
        break;
    
    case 'PATCH':
        if (noConfigDialog)
            return res
                .status(404)
                .send('Config is disabled');
         
        patch(req, res);
        break;
    
    default:
        next();
    }
}

function get(req, res) {
    const data = jonny.stringify(config);
    
    ponse.send(data, {
        name    : 'config.json',
        request : req,
        response: res,
        cache   : false
    });
}

function patch(req, res) {
    const jsonStore = fullstore();
    const options = {
        name    : 'config.json',
        request : req,
        response: res,
        cache   : false
    };
    
    const saveData = wraptile(save);
    
    pullout(req, 'string')
        .then(jonny.parse)
        .then(jsonStore)
        .then(manageConfig)
        .then(saveData)
        .then(jsonStore)
        .then(key)
        .then(formatMsg('config'))
        .then(send(options))
        .catch(sendError(options));
}

function traverse(json) {
    Object.keys(json).forEach((name) => {
        manage(name, json[name]);
    });
}

module.exports._cryptoPass = cryptoPass;
function cryptoPass(json) {
    const algo = manage('algo');
    
    if (!json.password)
        return json;
    
    const password = criton(json.password, algo);
    
    return Object.assign({}, json, {
        password,
    });
}

function check(socket, authCheck) {
    if (!socket)
        throw Error('socket could not be empty!');
    
    if (authCheck && typeof authCheck !== 'function')
        throw Error('authCheck should be function!');
}

