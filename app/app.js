'use strict';

const NodeRover = require('./lib/noderover.js');
const NodeRover_webclient = require('./lib/noderover_webclient.js');

var webclient = new NodeRover_webclient();
	webclient.init();

var drone = new NodeRover();
	drone.init();
	
	webclient.cb_control = function (data) { drone.control(data); }	// Control callback webclient -> rover motors
