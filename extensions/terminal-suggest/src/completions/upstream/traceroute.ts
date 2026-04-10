const completionSpec: Fig.Spec = {
	name: "traceroute",
	description: "Print the route packets take to network host",
	options: [
		{
			name: ["--help", "-h"],
			description: "Show help for traceroute",
		},
		{
			name: "-a",
			description: "Turn on AS# lookups for each hop encountered",
		},
		{
			name: "-A",
			args: { name: "as_server" },
			description:
				"Turn on AS# lookups and use the given server instead of the default",
		},
		{
			name: "-d",
			description: "Enable socket level debugging",
		},
		{
			name: "-D",
			description:
				"When an ICMP response to our probe datagram is received, print the differences between the transmitted packet and the packet quoted by the ICMP response. A key showing the location of fields within the transmitted packet is printed, followed by the original packet in hex, followed by the quoted packet in hex. Bytes that are unchanged in the quoted packet are shown as underscores. Note, the IP checksum and the TTL of the quoted packet are not expected to match. By default, only one probe per hop is sent with this option",
		},
		{
			name: "-e",
			description:
				"Firewall evasion mode. Use fixed destination ports for UDP and TCP probes. The destination port does NOT increment with each packet sent",
		},
		{
			name: "-f",
			args: { name: "first_ttl" },
			description:
				"Set the initial time-to-live used in the first outgoing probe packet",
		},
		{
			name: "-F",
			description: "Set the `don't fragment` bit",
		},
		{
			name: "-g",
			args: { name: "gateway" },
			description: "Specify a loose source route gateway (8 maximum)",
		},
		{
			name: "-i",
			args: { name: "iface" },
			description:
				"Specify a network interface to obtain the source IP address for outgoing probe packets. This is normally only useful on a multihomed host. (See the -s flag for another way to do this.)",
		},
		{
			name: "-I",
			description:
				"Use ICMP ECHO instead of UDP datagrams. (A synonym for `-P icmp`)",
		},
		{
			name: "-M",
			args: { name: "first_ttl" },
			description:
				"Set the initial time-to-live value used in outgoing probe packets. The default is 1, i.e., start with the first hop",
		},
		{
			name: "-m",
			args: { name: "max_ttl" },
			description:
				"Set the max time-to-live (max number of hops) used in outgoing probe packets. The default is net.inet.ip.ttl hops (the same default used for TCP connections)",
		},
		{
			name: "-n",
			description:
				"Print hop addresses numerically rather than symbolically and numerically (saves a nameserver address-to-name lookup for each gateway found on the path)",
		},
		{
			name: "-P",
			args: { name: "proto" },
			description:
				"Send packets of specified IP protocol. The currently supported protocols are: UDP, TCP, GRE and ICMP Other protocols may also be specified (either by name or by number), though traceroute does not implement any special knowledge of their packet formats. This option is useful for determining which router along a path may be blocking packets based on IP protocol number. But see BUGS below",
		},
		{
			name: "-p",
			args: { name: "port" },
			description:
				"Protocol specific. For UDP and TCP, sets the base port number used in probes (default is 33434). traceroute hopes that nothing is listening on UDP ports base to base+nhops-1 at the destination host (so an ICMP PORT_UNREACHABLE message will be returned to terminate the route tracing). If something is listening on a port in the default range, this option can be used to pick an unused port range",
		},
		{
			name: "-q",
			args: { name: "nqueries" },
			description:
				"Set the number of probes per ``ttl'' to nqueries (default is three probes)",
		},
		{
			name: "-r",
			description:
				"Bypass the normal routing tables and send directly to a host on an attached network. If the host is not on a directly-attached network, an error is returned. This option can be used to ping a local host through an interface that has no route through it (e.g., after the interface was dropped by routed(8))",
		},
		{
			name: "-s",
			args: { name: "src_addr" },
			description:
				"Use the following IP address (which must be given as an IP number, not a hostname) as the source address in outgoing probe packets. On hosts with more than one IP address, this option can be used to force the source address to be something other than the IP address of the interface the probe packet is sent on. If the IP address is not one of this machine's interface addresses, an error is returned and nothing is sent. (See the -i flag for another way to do this.)",
		},
		{
			name: "-S",
			description:
				"Print a summary of how many probes were not answered for each hop",
		},
		{
			name: "-t",
			args: { name: "tos" },
			description:
				"Set the type-of-service in probe packets to the following value (default zero). The value must be a decimal integer in the range 0 to 255. This option can be used to see if different types-of- service result in different paths. (If you are not running a 4.4BSD or later system, this may be academic since the normal network services like telnet and ftp don't let you control the TOS). Not all values of TOS are legal or meaningful - see the IP spec for definitions. Useful values are probably `-t 16' (low delay) and `-t 8' (high throughput)",
		},
		{
			name: "-v",
			description:
				"Verbose output. Received ICMP packets other than TIME_EXCEEDED and UNREACHABLEs are listed",
		},
		{
			name: "-w",
			description:
				"Set the time (in seconds) to wait for a response to a probe (default 5 sec.)",
		},
		{
			name: "-x",
			description:
				"Toggle IP checksums. Normally, this prevents traceroute from calculating IP checksums. In some cases, the operating system can overwrite parts of the outgoing packet but not recalculate the checksum (so in some cases the default is to not calculate checksums and using -x causes them to be calculated). Note that checksums are usually required for the last hop when using ICMP ECHO probes ( -I ). So they are always calculated when using ICMP",
		},
		{
			name: "-z",
			args: { name: "pausemsecs" },
			description:
				"Set the time (in milliseconds) to pause between probes (default 0). Some systems such as Solaris and routers such as Ciscos rate limit ICMP messages. A good value to use with this this is 500 (e.g. 1/2 second)",
		},
	],
	args: {
		name: "host",
	},
};
export default completionSpec;
