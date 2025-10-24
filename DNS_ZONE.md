# DNS zone records for fitvestmoda.com

The following are the DNS entries intended for the `fitvestmoda.com` zone. Apply changes only through the domain registrar or DNS provider UI (Locaweb) and follow your team's deploy checklist (see `README.md`).

Zone entries (TTL default if not set):

Root (A record)
.    A     179.188.12.92

www (CNAME)
www  CNAME  fitvestmoda.com

_domainconnect (CNAME)
_domainconnect  CNAME  domainconnect.locaweb.com.br

ftp (CNAME)
ftp  CNAME  fitvestmoda.com

Nameservers (set at registrar)
.   NS   ns1.locaweb.com.br
.   NS   ns2.locaweb.com.br
.   NS   ns3.locaweb.com.br

SOA (example provided by registrar)
.   SOA  ns1.locaweb.com.br. postmaster.locaweb.com.br. 2025101003 3600 600 1209600 3600

Notes
- The SOA serial (2025101003) follows the YYYYMMDDnn convention — update it when changing zone records.
- The root A record points the apex domain to `179.188.12.92`.
- `www` is a CNAME to the apex; ensure your hosting supports serving traffic for the apex and the `www` alias.
- `_domainconnect` is used by domain-connect integrations (Locaweb) for automatic DNS provisioning.
- Use the checklist in `README.md` before making DNS changes (reduce TTL, test propagation, validate SSL).

If you want, I can also generate a BIND-style zone file or `dig`/`nslookup` commands to validate these records from multiple resolvers.
