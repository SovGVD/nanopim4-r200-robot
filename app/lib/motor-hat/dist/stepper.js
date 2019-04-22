'use strict';

/**
 * @module MotorHat/Stepper
 */

// *1 default parameters to trap undefined callbacks ignored from coverage for
// Private functions as can't be easily tested.

var async = require('async');

var debug = require('debug')('motor-hat:stepperlib');
var parambulator = require('parambulator');
var sleep = require('sleep').msleep;

var errHdlr = function errHdlr(err) {
  if (err) {
    throw new Error(err);
  }
};

var isRequired = function isRequired() {
  throw new Error('Callback is required for async methods.');
};

/**
 * Creates a stepper motor controller.
 * Pass in an options object to generate an uninitialized StepperLib object.
 *
 * @example Basic Usage:
 *
 * const opts = {
 *   pwm: pwm,
 *   pins: {
 *     W1: {
 *       PWM: 8,
 *       IN1: 10,
 *       IN2: 9,
 *     },
 *     W2: {
 *     PWM: 13,
 *     IN1: 11,
 *     IN2: 12,
 *   },
 *   steps: 540, // Steps per motor revolution
 *   style: 'microstep', // 'single', 'double', 'interleaved' or 'microstep'
 *   microsteps: 16, // If commanding with microsteps, do 8 or 16?
 *   frequency: 1600, // PWM controller work freq
 *   sps: 20, // Steps per second. Also possible to set rpm or pps (pulses per second)
 * };
 *
 * const stepper = require('./stepper.js')(opts).init();
 *
 * @param {Object} opts Servo controller initialization options.
 * @param {Object} opts.pwm PWM Interface Object
 * @param {Number} opts.frequency PWM Controller frequency for the stepper.
 * @param {Object} opts.pins Pin definition for the motor.
 * @param {Object} opts.pins.W1 Pin definition for winding 1 of the stepper
 * @param {Number} opts.pins.W1.PWM Pin number of the PWM output for winding 1.
 * @param {Number} opts.pins.W1.IN1 Pin number of the first coil output for winding 1.
 * @param {Number} opts.pins.W1.IN2 Pin number of the second coil output for winding 1.
 * @param {Object} opts.pins.W2 Pin definition for winding 2 of the stepper
 * @param {Number} opts.pins.W2.PWM Pin number of the PWM output for winding 2.
 * @param {Number} opts.pins.W2.IN1 Pin number of the first coil output for winding 2.
 * @param {Number} opts.pins.W2.IN2 Pin number of the second coil output for winding 2.
 * @param {Number} opts.steps Steps per revolution of the stepper motor.
 * @param {('single'|'double'|'interleaved'|'microstep')} opts.style Stepping style
 * @param {(8|16)} opts.microsteps number of microsteps per step.
 * @param {Number} [opts.sps] Steps per second.
 * @param {Number} [opts.pps] Pulses per second.
 * @param {Number} [opts.rpm] Revolutions per minute.
 * @returns {module:MotorHat/Stepper~stepper}
 */
module.exports = function Stepper(opts) {
  var validateDir = function validateDir(dir) {
    return dir !== 'fwd' && dir !== 'back' && errHdlr('Dir should be either "fwd" or "back".');
  };

  var stylespec = parambulator({
    style: {
      enum$: ['single', 'double', 'interleaved', 'microstep'],
      required$: true
    }
  });
  var freqspec = parambulator({ freq: 'number$, required$' });
  var msspec = parambulator({
    ms: {
      enum$: [8, 16],
      required$: true
    }
  });
  var stepspec = parambulator({ steps: 'number$, required$' });
  var currentspec = parambulator({
    current: {
      type$: 'number',
      min$: 0,
      max$: 1,
      required$: true
    }
  });
  var speedspec = parambulator({
    exactlyone$: ['pps', 'rpm', 'sps'],
    pps: 'number$',
    rpm: 'number$',
    sps: 'number$'
  });
  var optspec = parambulator({
    pwm: 'required$, notempty$',
    pins: {
      required$: true,
      notempty$: true,
      W1: {
        required$: true,
        minlen$: 3,
        maxlen$: 3,
        '*': {
          type$: 'number',
          min$: 0,
          max$: 15
        }
      },
      W2: {
        required$: true,
        minlen$: 3,
        maxlen$: 3,
        '*': {
          type$: 'number',
          min$: 0,
          max$: 15
        }
      }
    },
    steps: {
      type$: 'number',
      default$: 64 * 32
    },
    microsteps: {
      enum$: [8, 16],
      default$: 8
    },
    frequency: {
      type$: 'number',
      default$: 1600
    },
    style: {
      enum$: ['single', 'double', 'interleaved', 'microstep'],
      default$: 'double'
    },
    current: {
      type$: 'number',
      min$: 0,
      max$: 1,
      default$: 1
    },
    atmostone$: ['pps', 'rpm', 'sps'],
    pps: 'number$',
    rpm: 'number$',
    sps: 'number$'
  });

  optspec.validate(opts, errHdlr);
  var options = opts;
  var _ref = [options.pwm],
      pwm = _ref[0];

  var microstepsCurve = [];
  var currentStep = 0;
  var state = {};
  var pulsing = false;

  var pins = {};
  pins.PWMA = options.pins.W1.PWM || options.pins.W1[0];
  pins.AIN1 = options.pins.W1.IN1 || options.pins.W1[1];
  pins.AIN2 = options.pins.W1.IN2 || options.pins.W1[2];
  pins.PWMB = options.pins.W2.PWM || options.pins.W2[0];
  pins.BIN1 = options.pins.W2.IN1 || options.pins.W2[1];
  pins.BIN2 = options.pins.W2.IN2 || options.pins.W2[2];

  debug('New stepper: pins set to: ' + [pins.PWMA, pins.AIN1, pins.AIN2, pins.PWMB, pins.BIN1, pins.BIN2]);

  // We only actually send the commands if the state is changing
  var lazyPWM = function lazyPWM(pin, newState) {
    var cb = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : /* istanbul ignore next *1 */isRequired();

    // Decrement the maximum duty cycle by the rate passed in current
    var throttledState = newState * options.current;
    if (undefined === state[pin] || state[pin] !== throttledState) {
      pwm.setPWM(pins[pin], 0, throttledState, function (err, res) {
        state[pin] = throttledState;
        cb(err, res);
      });
    } else {
      cb(null);
    }
  };

  var lazyPin = function lazyPin(pin, newState) {
    var cb = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : /* istanbul ignore next *1 */isRequired();

    if (undefined === state[pin] || state[pin] !== newState) {
      pwm.setPin(pins[pin], newState, function (err, res) {
        state[pin] = newState;
        cb(err, res);
      });
    } else {
      cb(null);
    }
  };

  var lazyPWMSync = function lazyPWMSync(pin, newState) {
    // Decrement the maximum duty cycle by the rate passed in current
    var throttledState = newState * options.current;
    if (undefined === state[pin] || state[pin] !== throttledState) {
      pwm.setPWMSync(pins[pin], 0, throttledState);
      state[pin] = throttledState;
    }
  };

  var lazyPinSync = function lazyPinSync(pin, newState) {
    if (undefined === state[pin] || state[pin] !== newState) {
      pwm.setPinSync(pins[pin], newState);
      state[pin] = newState;
    }
  };

  var pulse = function pulse(newState) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : /* istanbul ignore next *1 */isRequired();

    var self = this;
    pulsing = true;
    async.series([lazyPWM.bind(self, 'PWMA', newState.PWMA), lazyPWM.bind(self, 'PWMB', newState.PWMB), lazyPin.bind(self, 'AIN2', newState.AIN2), lazyPin.bind(self, 'BIN1', newState.BIN1), lazyPin.bind(self, 'AIN1', newState.AIN1), lazyPin.bind(self, 'BIN2', newState.BIN2)], function (err, res) {
      pulsing = false;
      cb(err, res);
    });
  };

  var pulseSync = function pulseSync(newState) {
    lazyPWMSync('PWMA', newState.PWMA);
    lazyPWMSync('PWMB', newState.PWMB);
    lazyPinSync('AIN2', newState.AIN2);
    lazyPinSync('BIN1', newState.BIN1);
    lazyPinSync('AIN1', newState.AIN1);
    lazyPinSync('BIN2', newState.BIN2);
  };

  var step2coils = [[1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [0, 0, 1, 1], [0, 0, 0, 1], [1, 0, 0, 1]];

  var micro = function micro(dir) {
    validateDir(dir);

    var _ref2 = [options.microsteps],
        microsteps = _ref2[0];


    if (dir === 'fwd') {
      currentStep += 1;
    } else {
      currentStep -= 1;
    }

    // go to next 'step' and wrap around
    currentStep += microsteps * 4;
    currentStep %= microsteps * 4;

    var pwmA = 0;
    var pwmB = 0;
    var coils = [0, 0, 0, 0];
    if (currentStep >= 0 && currentStep < microsteps) {
      pwmA = microstepsCurve[microsteps - currentStep];
      pwmB = microstepsCurve[currentStep];
      coils = [1, 1, 0, 0];
    } else if (currentStep >= microsteps && currentStep < microsteps * 2) {
      pwmA = microstepsCurve[currentStep - microsteps];
      pwmB = microstepsCurve[microsteps * 2 - currentStep];
      coils = [0, 1, 1, 0];
    } else if (currentStep >= microsteps * 2 && currentStep < microsteps * 3) {
      pwmA = microstepsCurve[microsteps * 3 - currentStep];
      pwmB = microstepsCurve[currentStep - microsteps * 2];
      coils = [0, 0, 1, 1];
    } else {
      // if ((currentStep >= microsteps * 3) && (currentStep < microsteps * 4))
      pwmA = microstepsCurve[currentStep - microsteps * 3];
      pwmB = microstepsCurve[microsteps * 4 - currentStep];
      coils = [1, 0, 0, 1];
    }

    debug('MICROSTEPPING: Coils state = ' + coils);
    debug('MICROSTEPPING: PWM state = ' + [pwmA, pwmB]);

    return {
      PWMA: pwmA * 16,
      PWMB: pwmB * 16,
      AIN2: coils[0],
      BIN1: coils[1],
      AIN1: coils[2],
      BIN2: coils[3]
    };
  };

  var microStep = function microStep(dir) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : /* istanbul ignore next *1 */isRequired();

    pulse(micro(dir), cb);
  };

  var microStepSync = function microStepSync(dir) {
    pulseSync(micro(dir));
  };

  var double = function double(dir) {
    validateDir(dir);

    var _ref3 = [options.microsteps],
        microsteps = _ref3[0];

    var pwmA = 255;
    var pwmB = 255;

    // go to next odd half step
    if (dir === 'fwd') {
      currentStep += microsteps;
    } else {
      currentStep -= microsteps;
    }

    // for double stepping, we only use the odd halfsteps, floor to next odd halfstep if necesary
    currentStep -= (currentStep + microsteps / 2) % microsteps;

    // go to next 'step' and wrap around
    currentStep += microsteps * 4;
    currentStep %= microsteps * 4;

    // set up coils
    var coils = step2coils[Math.floor(currentStep / (microsteps / 2))];

    debug('DOUBLE STEPPING: Coils state = ' + coils);

    return {
      PWMA: pwmA * 16,
      PWMB: pwmB * 16,
      AIN2: coils[0],
      BIN1: coils[1],
      AIN1: coils[2],
      BIN2: coils[3]
    };
  };

  var doubleStep = function doubleStep(dir) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : /* istanbul ignore next *1 */isRequired();

    pulse(double(dir), cb);
  };

  var doubleStepSync = function doubleStepSync(dir) {
    pulseSync(double(dir));
  };

  var single = function single(dir) {
    validateDir(dir);

    var _ref4 = [options.microsteps],
        microsteps = _ref4[0];

    var pwmA = 255;
    var pwmB = 255;

    // go to next even half step
    if (dir === 'fwd') {
      currentStep += microsteps;
    } else {
      currentStep -= microsteps;
    }

    // for single stepping, we only use the even halfsteps, floor to next even halfstep if necesary
    currentStep -= currentStep % microsteps;

    // go to next 'step' and wrap around
    currentStep += microsteps * 4;
    currentStep %= microsteps * 4;

    // set up coils
    var coils = step2coils[Math.floor(currentStep / (microsteps / 2))];

    debug('SINGLE STEPPING: Coils state = ' + coils);

    return {
      PWMA: pwmA * 16,
      PWMB: pwmB * 16,
      AIN2: coils[0],
      BIN1: coils[1],
      AIN1: coils[2],
      BIN2: coils[3]
    };
  };

  var singleStep = function singleStepSync(dir) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : /* istanbul ignore next *1 */isRequired();

    pulse(single(dir), cb);
  };

  var singleStepSync = function singleStepSync(dir) {
    pulseSync(single(dir));
  };

  var interleaved = function interleaved(dir) {
    validateDir(dir);
    var _ref5 = [options.microsteps],
        microsteps = _ref5[0];


    var pwmA = 255;
    var pwmB = 255;

    if (dir === 'fwd') {
      currentStep += microsteps / 2;
    } else {
      currentStep -= microsteps / 2;
    }
    // for interleaved we only use halfsteps. floor to closest halfstep
    currentStep -= currentStep % (microsteps / 2);

    // go to next 'step' and wrap around
    currentStep += microsteps * 4;

    currentStep %= microsteps * 4;
    // set up coils
    var coils = step2coils[Math.floor(currentStep / (microsteps / 2))];

    debug('INTERLEAVED STEPPING: Coils state = ' + coils);

    return {
      PWMA: pwmA * 16,
      PWMB: pwmB * 16,
      AIN2: coils[0],
      BIN1: coils[1],
      AIN1: coils[2],
      BIN2: coils[3]
    };
  };

  // eslint-disable-next-line max-len
  var interleavedStep = function interleavedStep(dir) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : /* istanbul ignore next *1 */isRequired();

    pulse(interleaved(dir), cb);
  };

  var interleavedStepSync = function interleavedStepSync(dir) {
    pulseSync(interleaved(dir));
  };

  /**
   * Set motor speed for step().
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {Object} speed
   * @param {Number} [speed.sps] Speed in steps per second.
   * @param {Number} [speed.pps] Speed in pulses per second (pulses can be steps, microsteps, etc)
   * @param {Number} [speed.rpm] Speed in revolutions per minute.
   */
  var setSpeed = function setSpeed(speed) {
    speedspec.validate(speed, errHdlr);

    var halfStepMultiplier = options.style === 'interleaved' ? 2 : 1;
    var microStepMultiplier = options.style === 'microstep' ? options.microsteps * 2 : 1;

    if (speed.pps) {
      options.pulsefreq = speed.pps;
      options.stepfreq = options.pulsefreq / halfStepMultiplier / microStepMultiplier;
      options.rpm = undefined;
      options.sps = undefined;
      options.pps = speed.pps;
    } else if (speed.rpm) {
      options.stepfreq = speed.rpm * options.steps / 60;
      options.pulsefreq = options.stepfreq * halfStepMultiplier * microStepMultiplier;
      options.pps = undefined;
      options.sps = undefined;
      options.rpm = speed.rpm;
    } else {
      // } if (speed.sps) {
      options.stepfreq = speed.sps;
      options.pulsefreq = options.stepfreq * halfStepMultiplier * microStepMultiplier;
      options.pps = undefined;
      options.rpm = undefined;
      options.sps = speed.sps;
    }

    debug('STEPPER CONFIG: Step frequency set to ' + options.stepfreq);
    debug('STEPPER CONFIG: Pulse frequency set to ' + options.pulsefreq);
  };

  /**
   * Set stepping style.
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {('single'|'double'|'interleaved'|'microstep')} style Stepping style.
   */
  var setStyle = function setStyle(style) {
    stylespec.validate({ style: style }, errHdlr);
    options.style = style;
    debug('STEPPER CONFIG: Style set to: "' + options.style + '"');

    if (options.rpm || options.sps) {
      setSpeed(options);
    }
  };

  /**
   * Set PWM Controller working frequency asynchronously.
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {Number} freq PWM frequency.
   * @param {callback} cb Node style callback. cb(err, result).
   */
  var setFrequency = function setFrequency(freq) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : isRequired();

    freqspec.validate({ freq: freq }, errHdlr);
    options.frequency = freq;
    pwm.setPWMFreq(options.frequency, function (err, res) {
      if (!err) debug('STEPPER CONFIG: PWM Frequency set to: ' + options.frequency);
      cb(err, res);
    });
  };

  /**
   * Set PWM Controller working frequency synchronously.
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {Number} freq PWM frequency.
   */
  var setFrequencySync = function setFrequencySync(freq) {
    freqspec.validate({ freq: freq }, errHdlr);
    options.frequency = freq;
    pwm.setPWMFreqSync(options.frequency);
    debug('STEPPER CONFIG: PWM Frequency set to: ' + options.frequency);
  };

  /**
   * Set desired number of microsteps per step.
   * (Used for microstepping)
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {(8|16)} ms Microsteps per step
   */
  var setMicrosteps = function setMicrosteps(ms) {
    msspec.validate({ ms: ms }, errHdlr);
    options.microsteps = ms;
    debug('Microsteps set to: ' + options.microsteps);
    if (options.microsteps === 8) {
      microstepsCurve = [0, 50, 98, 142, 180, 212, 236, 250, 255];
    } else {
      microstepsCurve = [0, 25, 50, 74, 98, 120, 141, 162, 180, 197, 212, 225, 236, 244, 250, 253, 255];
    }

    if (options.rpm || options.sps) {
      setSpeed(options);
    }
  };

  /**
   * Set number of steps per revolution for motor.
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {Number} steps Number of steps per revolution for stepper motor.
   */
  var setSteps = function setSteps(steps) {
    stepspec.validate({ steps: steps }, errHdlr);
    options.steps = steps;

    debug('STEPPER CONFIG: Motor steps set to ' + steps);

    if (options.rpm || options.sps) {
      setSpeed(options);
    }
  };

  /**
   * Perform one step asynchronously.
   * Configuration as stepping style, speed, etc should have been set previously.
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {('fwd'|'back')} dir Direction of movement
   * @param {callback} cb Node style callback. cb(err, result).
   */
  var oneStep = function oneStep(dir) {
    var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : isRequired();

    if (options.style === 'microstep') {
      microStep(dir, cb);
    } else if (options.style === 'single') {
      singleStep(dir, cb);
    } else if (options.style === 'interleaved') {
      interleavedStep(dir, cb);
    } else {
      // if (options.style === 'double')
      doubleStep(dir, cb);
    }
  };

  /**
   * Perform one step asynchronously.
   * Configuration as stepping style, speed, etc should have been set previously.
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {('fwd'|'back')} dir Direction of movement
   */
  var oneStepSync = function oneStepSync(dir) {
    if (options.style === 'microstep') {
      microStepSync(dir);
    } else if (options.style === 'single') {
      singleStepSync(dir);
    } else if (options.style === 'interleaved') {
      interleavedStepSync(dir);
    } else {
      // if (options.style === 'double')
      doubleStepSync(dir);
    }
  };

  /**
   * @typedef {Object} StepResult
   * @static
   * @memberOf module:MotorHat/Stepper~stepper
   * @property {Number} StepResult.steps Performed steps
   * @property {String} StepResult.dir Direction of steps performed
   * @property {Number} StepResult.duration Time in ms taken to perform the steps
   * @property {Number} StepResult.retried Number of steps retried.
   */

  /**
   * Perform arbitrary number of steps asynchronously.
   * Configuration as stepping style, speed, etc should have been set previously.
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {('fwd'|'back')} dir Direction of movement
   * @param {Number} steps Number of steps.
   * @param {callback} cb Node style callback. cb(err, result).
   * @returns {module:MotorHat/Stepper~stepper.StepResult} result The result of the action.
   */
  var step = function step(dir, steps) {
    var cb = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : isRequired();

    if (undefined === options.pulsefreq) {
      setSpeed(options);
    }

    var wait = 1 / options.pulsefreq * 1000;

    var count = 0;
    var retried = 0;
    var now = void 0;
    var startTime = new Date().getTime();
    var timer = setInterval(function () {
      now = new Date().getTime();
      if (count >= steps) {
        clearInterval(timer);
        cb(null, {
          steps: count, dir: dir, duration: new Date().getTime() - startTime, retried: retried
        });
        return null;
      }
      if (pulsing) {
        debug('STEPPER: max speed reached, trying to send pulse while previous not finished');
        retried += 1;
        // cb('STEPPER: max speed reached, trying to send pulse while previous not finished');
        // clearInterval(timer);
        return null;
      }
      oneStep(dir, function () {
        count += 1;
        var remaining = wait - (new Date().getTime() - now);
        debug('STEPPER: Waiting %d ms until next step', remaining);
        now = new Date().getTime();
      });

      return null;
    }, wait);
  };

  /**
   * @typedef {Object} StepSyncResult
   * @static
   * @memberOf module:MotorHat/Stepper~stepper
   * @property {Number} StepResult.steps Performed steps
   * @property {String} StepResult.dir Direction of steps performed
   * @property {Number} StepResult.duration Time in ms taken to perform the steps
   */

  /**
   * Perform arbitrary number of steps synchronously.
   * Configuration as stepping style, speed, etc should have been set previously.
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {('fwd'|'back')} dir Direction of movement
   * @param {Number} steps Number of steps.
   * @returns {module:MotorHat/Stepper~stepper.StepSyncResult} result The result of the action.
   */
  var stepSync = function stepSync(dir, steps) {
    var last = new Date();
    var startTime = new Date().getTime();
    var now = last;
    var next = void 0;
    var count = void 0;

    if (undefined === options.pulsefreq) {
      setSpeed(options);
    }

    var wait = 1 / options.pulsefreq * 1000;

    for (count = 0; count < steps; count += 1) {
      now = new Date();
      next = new Date(last.getTime() + wait);
      if (next - now > 0) {
        debug('STEPPER: Waiting %d ms until next step', next - now);
        sleep(Math.floor(next - now));
      }
      oneStepSync(dir);
      last = next;
    }

    return { steps: count, dir: dir, duration: new Date().getTime() - startTime };
  };

  /**
   * Release the stepper motor asynchronously.
   *
   * Stops applying current to the motor coils.
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {Callback} cb Node style callback
   */
  var release = function release() {
    var cb = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : isRequired();

    debug('RELEASE STEPPER: Cutting power from motor coils.');

    pulse({
      PWMA: 0, PWMB: 0, AIN2: 0, BIN1: 0, AIN1: 0, BIN2: 0
    }, cb);
  };

  /**
   * Release the stepper motor synchronously.
   * Stops applying current to the motor coils.
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   */
  var releaseSync = function releaseSync() {
    debug('RELEASE STEPPER: Cutting power from motor coils.');

    pulseSync({
      PWMA: 0, PWMB: 0, AIN2: 0, BIN1: 0, AIN1: 0, BIN2: 0
    });
  };

  /**
   * Set the current rate at which to supply the steps.
   * Provide a number from 0 to 1 and the current will be reduced proportionally
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {Number} current Current rate, from 0 to 1.
   */
  var setCurrent = function setCurrent(current) {
    currentspec.validate({ current: current }, errHdlr);
    options.current = current;

    debug('STEPPER CONFIG: Motor current set to ' + current * 100 + '%');
  };

  /**
   * Initialize the Stepeper controller instance.
   *
   * @instance
   * @memberOf module:MotorHat/Stepper~stepper
   * @param {callback} [cb] Optional node style callback for asynch initialization
   * @returns {module:MotorHat/Stepper~stepper} Returns init'd Stepper controller object (self),
   * either directly or in second parameter to callback if callback provided, to enable chaining.
   */
  var init = function init(cb) {
    setMicrosteps(options.microsteps);
    setStyle(options.style);
    setCurrent(options.current);

    // Only set the speed if we're passed one in the options, maybe we only want to do single steps
    if (options.rpm || options.pps) {
      setSpeed(options);
    }

    var self = this;

    if (cb) {
      setFrequency(options.frequency, function () {
        cb(null, self);
      }); // Hz
    } else {
      setFrequencySync(options.frequency); // Hz
      return self;
    }

    return true;
  };

  /**
   * Stepper Controller Object
   * @namespace stepper
   * @see Use {@link module:MotorHat/Stepper|Stepper()} for object creation.
   * @see Use {@link module:MotorHat/Stepper~stepper#init} for object initialization.
   * @type {Object}
   */
  var stepper = {
    init: init,
    step: step,
    stepSync: stepSync,
    oneStep: oneStep,
    oneStepSync: oneStepSync,
    release: release,
    releaseSync: releaseSync,
    setCurrent: setCurrent,
    setStyle: setStyle,
    setFrequency: setFrequency,
    setFrequencySync: setFrequencySync,
    setMicrosteps: setMicrosteps,
    setSteps: setSteps,
    setSpeed: setSpeed,
    options: options
  };

  return Object.create(stepper);
};