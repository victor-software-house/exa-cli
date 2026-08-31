---
'@victor-software-house/exa-cli': minor
---

Add `exa auth login`, `status`, and `logout`. Interactive commands now resolve the API key from macOS Keychain, Linux Secret Service, or Windows Credential Manager after `--api-key` and `EXA_API_KEY`. Storing a key needs no external tool on any platform; on Linux a running Secret Service provider is still required. When secure storage is unavailable, `login` fails closed unless given `--insecure-storage`, which writes an atomic `0600` file instead.
