# nanopim4-r200-robot
some patches and code for nanopim4 + intel r200 based robot


## Video hardware acceleration for rk3399
MPP
```
  git clone -b release https://github.com/rockchip-linux/mpp.git
  cmake -DRKPLATFORM=ON -DHAVE_DRM=ON
  make
  sudo make install
```


Gstreamer plugin
```
  git clone https://github.com/rockchip-linux/gstreamer-rockchip.git
  ./autogen.sh --disable-rkximage
  make
  sudo make install
```

you must install the libraries into Gstreamer plugins search path. Usually it would be /usr/lib/gstreamer-1.0 or /usr/lib/aarch64-linux-gnu/gstreamer-1.0