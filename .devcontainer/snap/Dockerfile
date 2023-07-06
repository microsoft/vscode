# From https://serverfault.com/a/1087467

FROM ubuntu:latest

RUN apt-get update \
	&& apt-get install -y \
		systemd \
		snapd \
	&& rm -rf /var/lib/apt/lists/*

STOPSIGNAL SIGRTMIN+3

# Remove unnecessary units
RUN rm -f /lib/systemd/system/multi-user.target.wants/* \
  /etc/systemd/system/*.wants/* \
  /lib/systemd/system/local-fs.target.wants/* \
  /lib/systemd/system/sockets.target.wants/*udev* \
  /lib/systemd/system/sockets.target.wants/*initctl* \
  /lib/systemd/system/sysinit.target.wants/systemd-tmpfiles-setup* \
  /lib/systemd/system/systemd-update-utmp*

CMD [ "/lib/systemd/systemd", "log-level=info", "unit=sysinit.target" ]

# docker build -t systemd_test .
# docker run -t --rm --name systemd_test \
#   --privileged --cap-add SYS_ADMIN --security-opt seccomp=unconfined \
#   --cgroup-parent=docker.slice --cgroupns private \
#   --tmpfs /tmp --tmpfs /run --tmpfs /run/lock \
#   systemd_test
