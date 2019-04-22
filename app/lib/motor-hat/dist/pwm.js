'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var async = require('async');
var debug = require('debug')('motor-hat:pwmlib');
var sleep = require('sleep').msleep;

var errHdlr = function errHdlr(err) {
  debug('%s', err);
  throw new Error(err);
};

/* eslint "no-bitwise": "off" */

var isRequired = function isRequired() {
  throw new Error('Async functions require callback');
};

// # ============================================================================
// # Adapted from:
// #    Adafruit PCA9685 16-Channel PWM Servo Driver
// #    https://github.com/adafruit/Adafruit-Motor-HAT-Python-Library
// # ============================================================================

module.exports = function exports(options) {
  var validateFreq = function validateFreq(freq) {
    return typeof freq !== 'number' && errHdlr('freq should be a number.');
  };
  var validateChannel = function validateChannel(channel) {
    return (typeof channel !== 'number' || channel < 0 || channel > 15) && errHdlr('Channel should be a number between 0 and 15');
  };
  var validateState = function validateState(state) {
    return (typeof state !== 'number' || state !== 0 && state !== 1) && errHdlr('State should be 0 or 1.');
  };
  var validateOnOff = function validateOnOff(on, off) {
    return (typeof on !== 'number' || typeof off !== 'number' || on < 0 || on > 4096 || off < 0 || off > 4096) && errHdlr('on and off should be numbers between 0 and 4096.');
  };

  if (_typeof(options.i2c) !== 'object') {
    errHdlr('options.i2c is required and should be an object');
  }
  options.address = options.address || 0x6F;
  options.busnum = options.busnum;
  if (typeof options.busnum !== 'number') {
    errHdlr('options.busnum should be a number');
  }

  var i2c = options.i2c;

  var bus = void 0;

  var registers = {
    MODE1: 0x00,
    MODE2: 0x01,
    SUBADR1: 0x02,
    SUBADR2: 0x03,
    SUBADR3: 0x04,
    PRESCALE: 0xFE,
    LED0_ON_L: 0x06,
    LED0_ON_H: 0x07,
    LED0_OFF_L: 0x08,
    LED0_OFF_H: 0x09,
    ALL_LED_ON_L: 0xFA,
    ALL_LED_ON_H: 0xFB,
    ALL_LED_OFF_L: 0xFC,
    ALL_LED_OFF_H: 0xFD
  };

  var bits = {
    RESTART: 0x80,
    SLEEP: 0x10,
    ALLCALL: 0x01,
    INVRT: 0x10,
    OUTDRV: 0x04
  };

  var softwareReset = function softwareReset() {
    var cb = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : isRequired();

    // Sends a software reset (SWRST) command to all the servolib drivers on the bus
    bus.sendByte(0x00, 0x06, cb);
  };

  var softwareResetSync = function softwareResetSync() {
    // Sends a software reset (SWRST) command to all the servolib drivers on the bus
    bus.sendByteSync(0x00, 0x06);
  };

  var setPWMFreq = function setPWMFreq(freq) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : isRequired();

    validateFreq(freq);

    // Sets the PWM frequency"
    var prescaleval = 25000000.0; // 25MHz
    prescaleval /= 4096.0; // 12 - bit
    prescaleval /= freq;
    prescaleval -= 1.0;

    debug('Setting PWM frequency to %d Hz', freq);
    debug('Estimated pre-scale: %d', prescaleval);

    var prescale = Math.ceil(prescaleval);
    debug('Final pre-scale: %d', prescale);

    bus.readByte(options.address, registers.MODE1, function (err, res) {
      if (err) {
        return cb(err);
      }
      var oldmode = res;
      var newmode = oldmode & 0x7F | 0x10; // sleep
      async.series([bus.writeByte.bind(bus, options.address, registers.MODE1, newmode), // go to sleep
      bus.writeByte.bind(bus, options.address, registers.PRESCALE, Math.floor(prescale)), bus.writeByte.bind(bus, options.address, registers.MODE1, oldmode)], function (error) {
        if (error) {
          return cb(error);
        }
        setTimeout(function () {
          bus.writeByte(options.address, registers.MODE1, oldmode | 0x80, cb);
        }, 5);
        return null;
      });
      return null;
    });
  };

  var setPWMFreqSync = function setPWMFreqSync(freq) {
    validateFreq(freq);
    // Sets the PWM frequency"
    var prescaleval = 25000000.0; // 25MHz
    prescaleval /= 4096.0; // 12 - bit
    prescaleval /= freq;
    prescaleval -= 1.0;

    debug('Setting PWM frequency to %d Hz', freq);
    debug('Estimated pre-scale: %d', prescaleval);

    var prescale = Math.ceil(prescaleval);
    debug('Final pre-scale: %d', prescale);

    var oldmode = bus.readByteSync(options.address, registers.MODE1);
    var newmode = oldmode & 0x7F | 0x10; // sleep
    bus.writeByteSync(options.address, registers.MODE1, newmode); // go to sleep
    bus.writeByteSync(options.address, registers.PRESCALE, Math.floor(prescale));
    bus.writeByteSync(options.address, registers.MODE1, oldmode);
    sleep(5);
    bus.writeByteSync(options.address, registers.MODE1, oldmode | 0x80);
  };

  var getPWMFreq = function getPWMFreq() {
    var cb = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : isRequired();

    bus.readByte(options.address, registers.PRESCALE, function (err, result) {
      if (err) {
        return cb(err);
      }
      cb(null, 25000000 / ((result + 1) * 4096));
      return null;
    });
  };

  var getPWMFreqSync = function getPWMFreqSync() {
    var prescale = bus.readByteSync(options.address, registers.PRESCALE);

    return 25000000 / ((prescale + 1) * 4096);
  };

  var setPWM = function setPWM(channel, on, off) {
    var cb = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : isRequired();

    validateChannel(channel);
    validateOnOff(on, off);

    // Sets a single PWM channel
    var offset = 4 * channel;
    async.series([bus.writeByte.bind(bus, options.address, registers.LED0_ON_L + offset, on & 0xFF), bus.writeByte.bind(bus, options.address, registers.LED0_ON_H + offset, on >> 8), bus.writeByte.bind(bus, options.address, registers.LED0_OFF_L + offset, off & 0xFF), bus.writeByte.bind(bus, options.address, registers.LED0_OFF_H + offset, off >> 8)], cb);
  };

  var setPWMSync = function setPWMSync(channel, on, off) {
    validateChannel(channel);
    validateOnOff(on, off);

    // Sets a single PWM channel
    var offset = 4 * channel;
    bus.writeByteSync(options.address, registers.LED0_ON_L + offset, on & 0xFF);
    bus.writeByteSync(options.address, registers.LED0_ON_H + offset, on >> 8);
    bus.writeByteSync(options.address, registers.LED0_OFF_L + offset, off & 0xFF);
    bus.writeByteSync(options.address, registers.LED0_OFF_H + offset, off >> 8);
  };

  var setAllPWM = function setAllPWM(on, off) {
    var cb = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : isRequired();

    validateOnOff(on, off);
    // Sets a all PWM channels
    async.series([bus.writeByte.bind(bus, options.address, registers.ALL_LED_ON_L, on & 0xFF), bus.writeByte.bind(bus, options.address, registers.ALL_LED_ON_H, on >> 8), bus.writeByte.bind(bus, options.address, registers.ALL_LED_OFF_L, off & 0xFF), bus.writeByte.bind(bus, options.address, registers.ALL_LED_OFF_H, off >> 8)], cb);
  };

  var setAllPWMSync = function setAllPWMSync(on, off) {
    validateOnOff(on, off);
    // Sets a all PWM channels
    bus.writeByteSync(options.address, registers.ALL_LED_ON_L, on & 0xFF);
    bus.writeByteSync(options.address, registers.ALL_LED_ON_H, on >> 8);
    bus.writeByteSync(options.address, registers.ALL_LED_OFF_L, off & 0xFF);
    bus.writeByteSync(options.address, registers.ALL_LED_OFF_H, off >> 8);
  };

  var setPin = function setPin(channel, state) {
    var cb = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : isRequired();

    validateChannel(channel);
    validateState(state);

    if (state === 1) {
      setPWM(channel, 4096, 0, cb);
    } else {
      setPWM(channel, 0, 4096, cb);
    }
  };

  var setPinSync = function setPinSync(channel, state) {
    validateChannel(channel);
    validateState(state);

    if (state === 1) {
      setPWMSync(channel, 4096, 0);
    } else {
      setPWMSync(channel, 0, 4096);
    }
  };

  var init = function init(cb) {
    var self = this;

    debug('Initializing PWM driver on address ' + options.address);
    // By default, the correct I2C bus is auto-detected using /proc/cpuinfo
    // Alternatively, you can pass it in the busnum options property
    if (!cb) {
      bus = i2c.openSync(options.busnum, {});

      debug('Reseting PCA9685 MODE1 (without SLEEP) and MODE2');

      setAllPWMSync(0, 0);
      bus.writeByteSync(options.address, registers.MODE2, bits.OUTDRV);
      bus.writeByteSync(options.address, registers.MODE1, bits.ALLCALL);
      sleep(5); // wait for oscillator

      var mode1 = bus.readByteSync(options.address, registers.MODE1);
      mode1 &= ~bits.SLEEP; // wake up(reset sleep)

      bus.writeByteSync(options.address, registers.MODE1, mode1);
      sleep(5); // wait for oscillator

      return self;
    }

    bus = i2c;
    // bus.open(0, {}, (err, val) => {
    //   debug('callback');
    // });
    async.series([bus.open.bind(bus, options.busnum, {}), function (cb2) {
      debug('Reseting PCA9685 MODE1 (without SLEEP) and MODE2');cb2(null, null);
    }, setAllPWM.bind(self, 0, 0), bus.writeByte.bind(bus, options.address, registers.MODE2, bits.OUTDRV), bus.writeByte.bind(bus, options.address, registers.MODE1, bits.ALLCALL)], function (err3) {
      if (err3) return cb(err3);
      setTimeout(function () {
        async.waterfall([bus.readByte.bind(bus, options.address, registers.MODE1), function (byte, cb3) {
          // wake up(reset sleep));
          bus.writeByte(options.address, registers.MODE1, byte & ~bits.SLEEP, cb3);
        }], function (err4) {
          if (err4) return cb(err4);
          return setTimeout(function () {
            return cb(null, self);
          }, 5); // wait for oscillator
        });
      }, 5);
      return null;
    });

    return null;
  };

  return {
    init: init,
    softwareReset: softwareReset,
    softwareResetSync: softwareResetSync,
    setPWM: setPWM,
    setPWMSync: setPWMSync,
    setAllPWM: setAllPWM,
    setAllPWMSync: setAllPWMSync,
    setPin: setPin,
    setPinSync: setPinSync,
    setPWMFreq: setPWMFreq,
    setPWMFreqSync: setPWMFreqSync,
    getPWMFreq: getPWMFreq,
    getPWMFreqSync: getPWMFreqSync
  };
};