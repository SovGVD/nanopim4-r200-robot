'use strict';

/**
 * @module MotorHat
 */

/**
 * Set environment variable DEBUG to "motorhat:*" to get debug output
 * @name DEBUG~debug
 */

var debug = require('debug')('motor-hat:index');
var parambulator = require('parambulator');
var i2c = require('i2c-bus');
var async = require('async');

var pwmlib = require('./pwm.js');

/**
 * Servo Controller Factory
 *
 * @memberOf module:MotorHat~motorhat
 * @type {module:MotorHat/Servo}
 */
var servolib = require('./servo.js');
/**
 * Stepper Controller Factory
 *
 * @memberOf module:MotorHat~motorhat
 * @type {module:MotorHat/Stepper}
 */
var stepperlib = require('./stepper.js');
/**
 * DC Controller Factory
 *
 * @memberOf module:MotorHat~motorhat
 * @type {module:MotorHat/DC}
 */
var dclib = require('./dc.js');

var errHdlr = function errHdlr(err) {
  if (err) {
    debug('Validation eror: %s', err);
    throw new Error(err);
  }
};

/**
 * Creates a new MotorHat controller.
 *
 * Pass in an options object to generate an uninitialized MotorHat object.
 *
 * @example Basic Usage:
 *
 * const motorHat = require('motor-hat')({addr: 0x6F}).init();
 *
 * @param {Object} [opts]
 * @param {Integer} [opts.adress] i2c address of the PWM chip on the MotorHat.
 *
 *  * 0x6F for knockoff HATs.
 *
 *  * 0x60 for official AdaFruit HATs??
 * @param {Integer} [opts.busnum] i2c driver devfile number. Varies by RaspBerry version.
 *  Should be automatically detected.
 * @param {Array} [opts.steppers] Definition of the stepper motors connected to the HAT.
 *  At most 2 steppers, each motor is represented by either an object of the form
 *  {W1: winding, W2: winding}. Each winding should be one of following: 'M1', 'M2', 'M3',
 *  'M4' depending on the port the stepper is connected to. Correct example: {W1: 'M3', W2: 'M1'}
 * @param {String[]} [opts.dcs] Definition of the DC motors connected to the HAT.
 *  At most 4 DCs, each should be one of following: 'M1', 'M2', 'M3', 'M4' depending on
 *  port the motor is connected to.
 * @param {Integer[]} [opts.servos] Definition of the servos connected to the HAT.
 *  List of the channels that have servos connected to them. 0 to 15.
 * @returns {module:MotorHat~motorhat}
 */
module.exports = function MotorHat(opts) {
  var pins = {
    M1: {
      PWM: 0,
      IN2: 1,
      IN1: 2
    },
    M2: {
      PWM: 5,
      IN2: 4,
      IN1: 3
    },
    M3: {
      PWM: 15,
      IN2: 14,
      IN1: 13
    },
    M4: {
      PWM: 10,
      IN2: 11,
      IN1: 12
    }
  };

  var optspec = parambulator({
    address: {
      type$: 'number',
      default$: 0x6F
    },
    busnum: {
      type$: 'number',
      default$: undefined
    },
    steppers: {
      maxlen$: 2,
      '*': {
        minlen$: 2,
        maxlen$: 2,
        '*': {
          enum$: ['M1', 'M2', 'M3', 'M4']
        }
      },
      default$: []
    },
    dcs: {
      '*': {
        enum$: ['M1', 'M2', 'M3', 'M4']
      },
      uniq$: true,
      default$: []
    },
    servos: {
      '*': {
        type$: 'number',
        min$: 0,
        max$: 16
      },
      default$: []
    }
  });

  var options = {};

  /**
   * Array of initialized Stepper controllers
   *
   * @instance
   * @memberOf module:MotorHat~motorhat
   * @type {module:MotorHat/Stepper~stepper[]}
   */
  var steppers = [];
  /**
   * Array of initialized DC controllers
   *
   * @instance
   * @memberOf module:MotorHat~motorhat
   * @type {module:MotorHat/DC~dC[]}
   */
  var dcs = [];
  /**
   * Array of initialized Servo controllers
   *
   * @instance
   * @memberOf module:MotorHat~motorhat
   * @type {module:MotorHat/Servo~servo[]}
   */
  var servos = [];
  var pwm = void 0;

  function checkPins(optSteppers, optDCs, optServos) {
    var pinAloc = [];
    optSteppers.map(function (stepper) {
      pinAloc[pins[stepper.W1].PWM] = true;
      pinAloc[pins[stepper.W1].IN1] = true;
      pinAloc[pins[stepper.W1].IN2] = true;
      pinAloc[pins[stepper.W2].PWM] = true;
      pinAloc[pins[stepper.W2].IN1] = true;
      pinAloc[pins[stepper.W2].IN2] = true;
      return null;
    });

    optDCs.map(function (dc) {
      debug(dc);
      if (pinAloc[pins[dc].PWM] === true || pinAloc[pins[dc].IN1] === true || pinAloc[pins[dc].IN2] === true) {
        debug('Pins check: DCs: Wrong usage.\nMotor, Stepper and Servo definitions can\'t overlap on the same pins.\n');
        throw Error('Wrong usage.\nMotor, Stepper and Servo definitions can\'t overlap on the same pins.\n');
      } else {
        pinAloc[pins[dc].PWM] = true;
        pinAloc[pins[dc].IN1] = true;
        pinAloc[pins[dc].IN2] = true;
      }
      return null;
    });

    optServos.map(function (servo) {
      if (pinAloc[servo]) {
        debug('Pins check: servos: Wrong usage.\nMotor, Stepper and Servo definitions can\'t overlap on the same pins.\n');
        throw Error('Wrong usage.\nMotor, Stepper and Servo definitions can\'t overlap on the same pins.\n');
      } else {
        pinAloc[servo] = true;
      }
      return null;
    });
  }

  /**
   * Initialize the motorHat library instance.
   *
   * Instantiates the individual Motor/Servo/Stepper controllers and initializes them.
   *
   * @instance
   * @memberOf module:MotorHat~motorhat
   * @param cb Optional node style callback for asynch initialization
   * @returns {module:MotorHat~motorhat} Returns initialized motorHat object (self), either directly
   * or in second parameter to callback if callback provided, to enable chaining.
   */
  var init = function init(cb) {
    var pwmopts = { i2c: i2c, address: options.address, busnum: options.busnum };
    var self = this;
    pwm = pwmlib(pwmopts);

    // Synch inits
    if (!cb) {
      pwm.init();

      options.steppers.map(function (value) {
        steppers.push(stepperlib({ pwm: pwm, pins: { W1: pins[value.W1], W2: pins[value.W2] } }).init());
        return null;
      });
      options.servos.map(function (servoPin) {
        servos.push(servolib({ pwm: pwm, pin: servoPin }));
        return null;
      });
      options.dcs.map(function (value) {
        dcs.push(dclib({ pwm: pwm, pins: pins[value] }).init());
        return null;
      });

      return self;
    }

    pwm.init(function (err0) {
      if (err0) return cb(err0);
      // Asynch inits
      // Use async to do stepper inits one by one in async.
      async.mapSeries(options.steppers, function (value, callback) {
        stepperlib({ pwm: pwm, pins: { W1: pins[value.W1], W2: pins[value.W2] } }).init(function (err, val) {
          if (!err) steppers.push(val);
          callback(err, value);
          return null;
        });
      }, function (err1) {
        // Once steppers are done, move on to DCs
        if (err1) return cb(err1);
        return async.mapSeries(options.dcs, function (value, callback) {
          dclib({ pwm: pwm, pins: pins[value] }).init(function (err, val) {
            if (!err) dcs.push(val);
            callback(err, value);
            return null;
          });
        }, function (err2) {
          if (err2) return cb(err2);
          // Once done with DCs, do servos (no async init for servos).
          try {
            options.servos.map(function (servoPin) {
              servos.push(servolib({ pwm: pwm, pin: servoPin }));
              return null;
            });
          } catch (e) {
            return cb(e);
          }
          // Finally, call original callback with initialized instance.
          return cb(err2, self);
        });
      });

      return null;
    });

    return null;
  };

  /**
   * motorHat controller
   *
   * Needs to be initialized with init().
   * @namespace motorhat
   * @see Use {@link module:MotorHat|MotorHat()} for object creation.
   * @see Use {@link module:MotorHat~motorhat#init} for object initialization.
   * @type {Object}
   */
  var motorHat = {
    init: init,
    pins: pins,
    servo: servolib,
    stepper: stepperlib,
    dc: dclib,
    servos: servos,
    steppers: steppers,
    dcs: dcs
  };

  /* eslint no-param-reassign: "off" */
  options = opts || {};
  optspec.validate(options, errHdlr);

  checkPins(options.steppers, options.dcs, options.servos);

  return Object.create(motorHat);
};