const completionSpec: Fig.Spec = {
	name: "ping",
	args: {
		name: "Hostname or IP",
	},
	description: "Send ICMP ECHO_REQUEST to network hosts",
	options: [
		{
			name: "-A",
			description:
				"Audible. Output a bell (ASCII 0x07) character when no packet is received before the next packet is transmitted. To cater for round-trip times that are longer than the interval between trans- missions, further missing packets cause a bell only if the maxi- mum number of unreceived packets has increased",
		},
		{
			name: "-a",
			description:
				"Audible. Include a bell (ASCII 0x07) character in the output when any packet is received. This option is ignored if other format options are present",
		},
		{
			name: "-b",
			description:
				"Bind the socket to interface boundif for sending. This option is an Apple addition",
			args: {
				name: "boundif",
			},
		},
		{
			name: "-C",
			description:
				"Prohibit the socket from using the cellular network interface. This option is an Apple addition",
		},
		{
			name: "-c",
			description:
				"Stop after sending (and receiving) count ECHO_RESPONSE packets. If this option is not specified, ping will operate until inter- rupted. If this option is specified in conjunction with ping sweeps, each sweep will consist of count packets",
			args: {
				name: "count",
			},
		},
		{ name: "-D", description: "Set the Don't Fragment bit" },
		{
			name: "-d",
			description: "Set the SO_DEBUG option on the socket being used",
		},
		{
			name: "-f",
			description:
				"Flood ping. Outputs packets as fast as they come back or one hundred times per second, whichever is more. For every ECHO_REQUEST sent a period ``.'' is printed, while for every ECHO_REPLY received a backspace is printed. This provides a rapid display of how many packets are being dropped. Only the super-user may use this option. This can be very hard on a net- work and should be used with caution",
		},
		{
			name: "-G",
			description:
				"Sweepmaxsize Specify the maximum size of ICMP payload when sending sweeping pings. This option is required for ping sweeps",
			args: {
				name: "count",
			},
		},
		{
			name: "-g",
			description:
				"Specify the size of ICMP payload to start with when sending sweeping pings",
			args: {
				name: "sweepminsize",
				default: "0",
			},
		},
		{
			name: "-h",
			description:
				"Specify the number of bytes to increment the size of ICMP payload after each sweep when sending sweeping pings",
			args: {
				name: "sweepincrsize",
				default: "1",
			},
		},
		{
			name: "-I",
			description:
				"Source multicast packets with the given interface address. This flag only applies if the ping destination is a multicast address",
			args: {
				name: "iface",
			},
		},
		{
			name: "-i",
			description:
				"Wait wait seconds between sending each packet. The default is to wait for one second between each packet. The wait time may be fractional, but only the super-user may specify values less than 0.1 second. This option is incompatible with the -f option",
			args: {
				name: "wait",
			},
		},
		{
			name: "-k",
			description:
				"Specifies the traffic class to use for sending ICMP packets. By default ping uses the control traffic class (CTL). This option is an Apple addition",
			args: {
				name: "trafficclass",
				suggestions: [
					"BK_SYS",
					"BK",
					"BE",
					"RD",
					"OAM",
					"AV",
					"RV",
					"VI",
					"VO",
					"CTL",
				],
				default: "CTL",
			},
		},
		{
			name: "-K",
			description:
				"Specifies the network service type to use for sending ICMP pack- ets. Note this overrides the default traffic class (-k can still be specified after -K to use both). This option is an Apple addition",
			args: {
				name: "netservicetype",
				suggestions: [
					"BK_SYS",
					"BK",
					"BE",
					"RV",
					"AV",
					"RD",
					"OAM",
					"VI",
					"SIG",
					"VO",
				],
			},
		},
		{
			name: "-L",
			description:
				"Suppress loopback of multicast packets. This flag only applies if the ping destination is a multicast address",
		},
		{
			name: "-l",
			description:
				"If preload is specified, ping sends that many packets as fast as possible before falling into its normal mode of behavior. Only the super-user may use this option",
			args: {
				name: "preload",
			},
		},
		{
			name: "-M",
			description:
				"Use ICMP_MASKREQ or ICMP_TSTAMP instead of ICMP_ECHO. For mask, print the netmask of the remote machine. Set the net.inet.icmp.maskrepl MIB variable to enable ICMP_MASKREPLY. For time, print the origination, reception and transmission time- stamps",
			args: {
				name: "mask | time",
			},
		},
		{
			name: "-m",
			description:
				"Set the IP Time To Live for outgoing packets. If not specified, the kernel uses the value of the net.inet.ip.ttl MIB variable",
			args: {
				name: "ttl",
			},
		},
		{
			name: "-n",
			description:
				"Numeric output only. No attempt will be made to lookup symbolic names for host addresses",
		},
		{
			name: "-o",
			description: "Exit successfully after receiving one reply packet",
		},
		{
			name: "-P",
			description:
				"Policy specifies IPsec policy for the ping session. For details please refer to ipsec(4) and ipsec_set_policy(3)",
			args: {
				name: "policy",
			},
		},
		{
			name: "-p",
			description:
				"You may specify up to 16 'pad' bytes to fill out the packet you send. This is useful for diagnosing data-dependent problems in a network. For example, '-p ff' will cause the sent packet to be filled with all ones",
			args: {
				name: "pattern",
			},
		},
		{
			name: "-Q",
			description:
				"Somewhat quiet output. Don't display ICMP error messages that are in response to our query messages. Originally, the -v flag was required to display such errors, but -v displays all ICMP error messages. On a busy machine, this output can be overbear- ing. Without the -Q flag, ping prints out any ICMP error mes- sages caused by its own ECHO_REQUEST messages",
		},
		{
			name: "-q",
			description:
				"Quiet output. Nothing is displayed except the summary lines at startup time and when finished",
		},
		{
			name: "-R",
			description:
				"Record route. Includes the RECORD_ROUTE option in the ECHO_REQUEST packet and displays the route buffer on returned packets. Note that the IP header is only large enough for nine such routes; the traceroute(8) command is usually better at determining the route packets take to a particular destination. If more routes come back than should, such as due to an illegal spoofed packet, ping will print the route list and then truncate it at the correct spot. Many hosts ignore or discard the RECORD_ROUTE option",
		},
		{
			name: "-r",
			description:
				"Bypass the normal routing tables and send directly to a host on an attached network. If the host is not on a directly-attached network, an error is returned. This option can be used to ping a local host through an interface that has no route through it (e.g., after the interface was dropped by routed(8))",
		},
		{
			name: "-S",
			description:
				"Use the following IP address as the source address in outgoing packets. On hosts with more than one IP address, this option can be used to force the source address to be something other than the IP address of the interface the probe packet is sent on. If the IP address is not one of this machine's interface addresses, an error is returned and nothing is sent",
			args: {
				name: "src_addr",
			},
		},
		{
			name: "-s",
			description:
				"Specify the number of data bytes to be sent. The default is 56, which translates into 64 ICMP data bytes when combined with the 8 bytes of ICMP header data. This option cannot be used with ping sweeps",
			args: {
				name: "packetsize",
			},
		},
		{
			name: "-T",
			description:
				"Set the IP Time To Live for multicasted packets. This flag only applies if the ping destination is a multicast address",
			args: {
				name: "ttl",
			},
		},
		{
			name: "-t",
			description:
				"Specify a timeout, in seconds, before ping exits regardless of how many packets have been received",
			args: {
				name: "timeout",
			},
		},
		{
			name: "-v",
			description:
				"Verbose output. ICMP packets other than ECHO_RESPONSE that are received are listed",
		},
		{
			name: "-W",
			description:
				"Time in milliseconds to wait for a reply for each packet sent. If a reply arrives later, the packet is not printed as replied, but considered as replied when calculating statistics",
			args: {
				name: "waittime",
			},
		},
		{
			name: "-z",
			description: "Use the specified type of service",
			args: {
				name: "tos",
			},
		},
		// TODO(platform): apple only option
		{
			name: "--apple-connect",
			description: "Connects the socket to the destination address",
		},
		// TODO(platform): apple only option
		{
			name: "--apple-time",
			description: "Prints the time a packet was received",
		},
	],
};
export default completionSpec;
