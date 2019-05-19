# nanopim4-r200-robot
some patches and code for nanopim4 + intel r200 based robot

**CLOSED** due to permanent damage of the robot platform


## Video hardware acceleration for rk3399
Install packages: cmake pkg-config autopoint libtool

MPP
```
  git clone -b release https://github.com/rockchip-linux/mpp.git
  cmake -DRKPLATFORM=ON -DHAVE_DRM=ON
  make
  sudo make install
```


Install some more packages: gstreamer1.0-tools gstreamer1.0-nice gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-plugins-good libgstreamer1.0-dev git libglib2.0-dev libgstreamer-plugins-bad1.0-dev libsoup2.4-dev libjson-glib-dev

Gstreamer plugin
```
  git clone https://github.com/rockchip-linux/gstreamer-rockchip.git
  ./autogen.sh --disable-rkximage
  make
  sudo make install
```

you must install (copy) the libraries into Gstreamer plugins search path. Usually it would be /usr/lib/gstreamer-1.0 or /usr/lib/aarch64-linux-gnu/gstreamer-1.0

## librealsense
Install packages: libglu1-mesa-dev libglfw3-dev libusb-1.0-0-dev pkg-config

Follow [Intel RealSense installation manual](https://github.com/IntelRealSense/librealsense/blob/v1.12.1/doc/installation.md)

