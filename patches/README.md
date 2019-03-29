# Patches for NanoPI M4

## uvcvideo
Patch for Armbian Ubuntu 18.04.2 with dev branch (kernel 5.0.0-rk3399)

`./compile.sh BOARD=nanopim4 BRANCH=dev RELEASE=bionic BUILD_DESKTOP=no KERNEL_ONLY=no KERNEL_CONFIGURE=no INSTALL_HEADERS=yes CLEAN_LEVEL=make,debs`

`userpatches/kernel/rockchip64-dev/uvcvideo-librealsense-5.0.0-1092-ayufan.patch`

## librealsense v1.12.1
`librealsense_v1.12.1.patch`


## NanoHAT Motor for NanoPI M4
Wiring (DON'T USE EXTRA POWER, e.g. USB-C):
| Motor HAT    | NanoPI M4      |
|--------------|----------------|
| 3 I2C_SDA    | 3 I2C2_SDA(3V) |
| 5 I2C_SCL    | 5 I2C2_SCL(3V) |
| 4 VDD_5V OUT | 4 VDD_5V       |
| 6 GND        | 6 GND          |

NanoPi M4 (Arbmian Ubuntu 18.04.2) I2C2 is /dev/i2c-2

extremely durty hack `nanopi_m4_nanohat_motor_i2c_bus.patch`
