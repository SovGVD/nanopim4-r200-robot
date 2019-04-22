'use strict'

const motors = require('./motor-hat/dist/index.js');

var noderover = function () {
	this.motorHat = motors({
		address: 0x60,
		busnum: 2,	// NanoPi M4 i2c port number
		dcs: ['M1','M2','M3','M4']
	}).init();
	
	this.motorsPreValue = {
			top_left: 0,
			top_right: 0,
			bottom_left: 0,
			bottom_right: 0
		};
	this.motorsValue = {
			top_left: 0,
			top_right: 0,
			bottom_left: 0,
			bottom_right: 0
		};
	
	this.motorsMapping = {
			0: 'top_left',
			1: 'bottom_left',
			2: 'top_right',
			3: 'bottom_right'
		};
	
	this.failsafe_ok = 20;	// 20 * 100ms = 2 seconds
	this.failsafe_value = 20;
	this.failsafe_timer = false;
	
	this._isset = function (v) {
		if (typeof v != 'undefined') return true;
		return false;
	}
	
	this.limit = function (v) {
		if (v >  1) return 1;
		if (v < -1) return -1;
		return v;
	}
	
	this.control = function (data) {
		// new data, so update failsafe
		this.failsafe_value = parseInt(this.failsafe_ok);
		if (this._isset(data.cmd)) {
			if (data.cmd.cmd == 'move') {
				this.motorsValue.top_left     = this.limit(parseFloat(data.throttle) + parseFloat(data.yaw));
				this.motorsValue.top_right    = this.limit(parseFloat(data.throttle) - parseFloat(data.yaw));
				this.motorsValue.bottom_left  = this.limit(parseFloat(data.throttle) + parseFloat(data.yaw));
				this.motorsValue.bottom_right = this.limit(parseFloat(data.throttle) - parseFloat(data.yaw));
				this.motorsUpdate();			
			} else if (data.cmd.cmd == 'ping') {
				// TODO ???
			}
		}
	}

	this.failsafe_action = function () {
		console.log("!!!FAILSAFE!!!");
		this.motorsValue.top_left     = 0;
		this.motorsValue.top_right    = 0;
		this.motorsValue.bottom_left  = 0;
		this.motorsValue.bottom_right = 0;
		this.motorsUpdate();
	}
	
	this.motorsUpdate = function () {
		var do_update = false;
		for (var m = 0; m < 4; m++) {
			if (this.motorsValue[this.motorsMapping[m]] != this.motorsPreValue[this.motorsMapping[m]]) {
				// value has been changed
				if (this.motorsValue[this.motorsMapping[m]] == 0) {
					this.motorHat.dcs[m].stop(this.cb_motorHat);
				} else {
					var value = this.motorsValue[this.motorsMapping[m]];
					var way = value >= 0?'fwd':'back';
					this.motorHat.dcs[m].run(way, function(m, way, value, err, result) {
						if (err) {
							console.log("Error", "motor", m, way, value, err);
						} else {
							this.motorHat.dcs[m].setSpeed(100*value, this.cb_motorHat);
						}
					}).bind(this, m, way, value);
				}
			}
		}
		this.motorsValue = this.motorsPreValue;
	}

	this.cb_motorHat = function(err, result) {
		if (err) {
			console.log('Oh no, there was an error');
		} else {
			// Move on..	
		}
	};
	
	this.init = function () {
		// run timer every 100ms and reduce failback_value
		// if this.failsafe_value become less than `0`
		// something goes wrong anf it is better to stop all motors
		this.failsave_timer = setTimeout( function () {
			if (this.failsafe_value < 0) {
				this.failsave_action();
			} else {
				this.failsafe_value--;
			}
		}.bind(this)
		,100);
	}

}
module.exports = noderover;
