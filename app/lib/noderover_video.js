'use strict'

const { spawn } = require('child_process');

var broadwayVideo = function (callback) {
	this.header_h264 = Buffer.from([0,0,0,1]);	// h264 NAL unit
	this.h264encoder_spawn = {
		"command" : 'gst-launch-1.0',
		"args"    : [ 
				'-q',
				'v4l2src', 'device=/dev/video4', '!', 
				'video/x-raw,width=640,height=480,framerate=30/1', '!', 
				'videoconvert', '!', 
				'queue', '!', 
				'mpph264enc', '!', 
				'fdsink'
			]
	};
	this.h264encoder = false;
	this.h264chunks = [];
	this.h264unit = false;
	
	this.callback = callback;	// callback for video units (h264 baseline NAL units)
	
	this.init = function () {
		this.h264encoder_init();
	}
	
	this.h264encoder_init = function () {
		this.h264encoder = spawn( this.h264encoder_spawn.command, this.h264encoder_spawn.args);
		
		this.h264encoder.stderr.on('data', function (data) {
			console.log("video error", data.toString());
		}.bind(this));
		
		this.h264encoder.stdout.on('data', function (data) {
			var idx = data.indexOf(this.header_h264);
			if (idx>-1 && this.h264chunks.length>0) {
				this.h264chunks.push(data.slice(0,idx));
				try {
					this.callback(Buffer.concat(this.h264chunks).toString('binary'));
				} catch (e) {
					this.callback(true);
				}
				this.h264chunks=[];
				this.h264chunks.push(data.slice(idx));
			} else {
				this.h264chunks.push(data);
			}
		}.bind(this));
	}
	this.h264encoder_in = function (h264chunk) {
		this.h264encoder.stdin.write(h264chunk);
	}

}

module.exports = broadwayVideo;
