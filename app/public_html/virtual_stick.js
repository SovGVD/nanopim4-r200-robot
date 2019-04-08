var virtualStick = function () {
	// TODO
	// - debounce
	this.htmlConfig = {
			w: false,
			h: false
		};
	this.position = {
			x: 0,
			y: 0
		};
	this.stickConfig = {
			deadband: 0.1,
		};
	this.events = {};
	this.obj = false;
	this.callback = false;
	
	this.touchStatus = false;
	
	this.init = function (_obj,_callback) {
		this.obj = _obj;
		this.htmlConfig = {
				w: this.obj.offsetWidth,
				h: this.obj.offsetWidth
			};
		this.updateHtml();
		this.callback = _callback;
		this.initEvents();
		return this;
	}
	
	this.destroy = function () {
		// TODO
		// - remove events
	}
	
	this.initEvents = function () {
		this.obj.addEventListener(
			'mousedown', function (e) {
				this.evtStart(e);
			}.bind(this)
		);
		this.obj.addEventListener(
			'mouseup', function (e) {
				this.evtEnd(e);
			}.bind(this)
		);
		this.obj.addEventListener(
			'mousemove', function (e) {
				this.evtMove(e);
			}.bind(this)
		);
		this.obj.addEventListener(
			'touchstart', function (e) {
				this.evtStart(e);
			}.bind(this)
		);
		this.obj.addEventListener(
			'touchend', function (e) {
				this.evtEnd(e);
			}.bind(this)
		);
		this.obj.addEventListener(
			'touchmove', function (e) {
				this.evtMove(e);
			}.bind(this)
		);
	}
	
	this.evtStart = function (e) {
		this.touchStatus = true;
	}
	
	this.evtEnd = function (e) {
		this.touchStatus = false;
		this.position.x = 0;
		this.position.y = 0;
		this.send();
	}
	
	this.evtMove = function (e) {
		var s = e.target.getBoundingClientRect();
		if (this.touchStatus) {
			this.position.x = ((e.clientX||e.changedTouches[0].clientX)-s.left)/s.width*2-1;
			this.position.y = ((e.clientY||e.changedTouches[0].clientY)-s.top)/s.height*2-1;	// invert Y
			if (this.position.x >  1) this.position.x =  1;
			if (this.position.x < -1) this.position.x = -1;
			if (this.position.y >  1) this.position.y =  1;
			if (this.position.y < -1) this.position.y = -1;
			if (this.position.x > -this.stickConfig.deadband && this.position.x < this.stickConfig.deadband) this.position.x = 0;
			if (this.position.y > -this.stickConfig.deadband && this.position.y < this.stickConfig.deadband) this.position.y = 0;
			this.send()
		};
	}
	
	this.send = function () {
		this.obj.style.backgroundPosition = (this.position.x + 1)*50 + "% " + (this.position.y + 1)*50 + "%";
		this.callback(this.position.x, this.position.y);
	}
	
	this.updateHtml = function () {
		console.log("Set size", this.htmlConfig);
		this.obj.style.width = this.htmlConfig.w;
		this.obj.style.height = this.htmlConfig.h;
	};
};
