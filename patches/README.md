# Patches for NanoPI M4

## uvcvideo
### Patch for Armbian Ubuntu 18.04.2 with dev branch (kernel 5.0.0-rk3399)

Copy patch to `userpatches/kernel/rockchip64-dev/uvcvideo-librealsense-5.0.0-1092-ayufan.patch`

Build: `./compile.sh BOARD=nanopim4 BRANCH=dev RELEASE=bionic BUILD_DESKTOP=no KERNEL_ONLY=no KERNEL_CONFIGURE=no INSTALL_HEADERS=yes CLEAN_LEVEL=make,debs`


### Patch for Armbian Ubuntu 18.04.2 with default branch (kernel 4.4.176-rk3399)

Copy patch to: `userpatches/kernel/rk3399-default/librealsense_patch_linux-4.4.176-rk3399.patch`

Enable UVC module in config (TODO howto)

```
CONFIG_USB_VIDEO_CLASS=m
CONFIG_USB_VIDEO_CLASS_INPUT_EVDEV=y
```

Build: `./compile.sh BOARD=nanopim4 BRANCH=default RELEASE=bionic BUILD_DESKTOP=no KERNEL_ONLY=no KERNEL_CONFIGURE=no INSTALL_HEADERS=yes CLEAN_LEVEL=make,debs`


## librealsense v1.12.1
`librealsense_v1.12.1.patch`


## NanoHAT Motor for NanoPI M4
Wiring (DON'T USE EXTRA POWER, e.g. USB-C):

| Pin | Motor HAT  |     | Pin | NanoPI M4    |
| --: | ---------- | --- | --: | ------------ |
|  3  | I2C_SDA    |     |  3  | I2C2_SDA(3V) |
|  5  | I2C_SCL    |     |  5  | I2C2_SCL(3V) |
|  4  | VDD_5V OUT |     |  4  | VDD_5V       |
|  6  | GND        |     |  6  | GND          |

NanoPi M4 (Arbmian Ubuntu 18.04.2) I2C2 is /dev/i2c-2

extremely durty hack `nanopi_m4_nanohat_motor_i2c_bus.patch`

## NanoHAT with node.js
If you want to use nodejs, you can patch [motor-hat](https://github.com/jcane86/motor-hat):
```
diff --git a/lib/index.js b/lib/index.js
index 8187714..591a7cf 100644
--- a/lib/index.js
+++ b/lib/index.js
@@ -211,7 +211,7 @@ module.exports = function MotorHat(opts) {
    * or in second parameter to callback if callback provided, to enable chaining.
    */
   const init = function init(cb) {
-    const pwmopts = { i2c, address: options.address };
+    const pwmopts = { i2c, address: options.address, busnum: options.busnum };
     const self = this;
     pwm = pwmlib(pwmopts);
```
