'use strict'

const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const videoBackend = require('./noderover_video.js');

var noderover_webclient = function () {
	this.videobackend = new videoBackend(function(u) { this.videoSend(u);}.bind(this), 'gstreamer-rockchip');
	this.path = './public_html/';
	this.http_port = 8080;
	this.ws_video_port = 8081;
	//this.ws_control_port = 8082;
	this.file2mime = {
			".html" : { t:'text/html',                e:'utf8'   },
			".js"   : { t:'application/javascript',   e:'utf8'   },
			".wasm" : { t:'application/wasm',         e:'binary' },
			".ico"  : { t:'image/x-icon',             e:'binary' },
			".css"  : { t:'text/css',                 e:'utf8'   },
			".map"  : { t:'application/json',         e:'utf8'   },
		};
	this.wss_video = false;
	//this.wss_control = false;
	this._ws_video_client = false;
	//this._ws_control_client = false;
	
	this.init = function () {
		this.wss_init();
		this.videobackend.init();
		http.createServer(function (req, res) {
			this._http_res(req, res)
		}.bind(this)).listen(this.http_port);
	}
	
	this.videoSend = function (u) {
		this._ws_video_client.send(u);
	}
	this.h264encoder_in = function (h264chunk) {
		this.h264encoder.stdin.write(h264chunk);
	}

/*	this.telemetry_in = function (data) {
		if (this._ws_telemetry_client !== false) {
			try {
				this._ws_telemetry_client.send(data);
			} catch (e) { this._ws_telemetry_client = false; }
		}
	}*/

	
	this.wss_init = function () {
		// Video Feed
		this.wss_video = new WebSocket.Server({ port: this.ws_video_port });
		this.wss_video.on('connection', function connection(ws) {
			ws.on('message', function (message) {
				this._ws_video_client = ws;
				try {
					// nothing to do
				} catch (e) {
					ws.send("false");
					console.log("WSVIDEOERROR:",e);
				}
			}.bind(this));
		}.bind(this));
		
		// Telemetry Feed
		/*this.wss_telemetry = new WebSocket.Server({ port: this.ws_telemetry_port });
		this.wss_telemetry.on('connection', function connection(ws) {
			ws.on('message', function (message) {
				this._ws_telemetry_client = ws;
				try {
					if (message[0] == '{') {
						this.tello_cmd(JSON.parse(message));
					} else {
						console.log("WebClient",message);
					}
				} catch (e) {
					ws.send("false");
					console.log("WSTELEMETRYERROR:",e,"Message",message);
				}
			}.bind(this));
		}.bind(this));*/
	}
	
	this._http_res = function (req, res) {
		var url = req.url.split("/"); url.shift(); url = (url.join("/")).replace(new RegExp("\\.\\.",'g'),"");
		if (url=='') url="index.html";
		url = this.path+url;
		var type = url.split("."); 
			type="."+type.pop(); 
			console.log("HTTPREQ:", req.url, "as", url, "type", type);
			type = (typeof this.file2mime[type] !== undefined)?this.file2mime[type]:'text/html';
		fs.readFile(url, { encoding: type.e }, function (type, res, err, data) {
			if (err) {
				//console.log("HTTP404:", err);
				res.writeHead(404, {'Content-Type': 'text/html'});
				res.end("404 Not Found");
			} else {
				console.log("HTTP200:", type);
				res.writeHead(200, {'Content-Type': type.t});
				res.end(data, type.e);
			}
		}.bind(this, type, res));
	}
}

module.exports = noderover_webclient;
