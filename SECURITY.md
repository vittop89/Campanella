# Reporting a security issue

If you find a vulnerability in Campanella — the application, the Apps Script
code, the installer or the Chrome extension — **do not open a public
issue**: use GitHub's private vulnerability reporting, from the *Security*
tab of the repository ("Report a vulnerability"), or
<https://github.com/vittop89/Campanella/security/advisories/new>. Italian or
English, as you prefer.

Say how to reproduce it and which data or permission is at stake. The
project is maintained by one person in their spare time: an answer may take
a few weeks, but it comes.

## What counts as a security issue, here

- The script does something the text does not say: sends email to others,
  deletes, contacts external services, asks for undocumented permissions.
- The application writes personal data somewhere other than the declared
  places (`campanella.json`, `campanella-dati.json`, the folders chosen by
  the user), or sends it over the network.
- The application connects to the internet without the user pressing a
  button, or sends text or files for rizzo-pii to an address that is not on
  the same computer.
- The download of rizzo-pii (from Settings or the C# installer) can be
  hijacked, or a file that fails its size check, or its SHA-256 check when
  GitHub publishes the SHA-256, gets launched.
- The Chrome extension reads or sends more than it declares.
- The installer or the uninstaller touch files outside their own folder.

Not security issues: the SmartScreen warning on unsigned executables (see
the README, "Code signing policy") and Google's "unverified app" warning,
which appears for every personal script.

## Supported versions

Only the latest published release. Earlier ones receive no fixes: update.
Settings > "Cerca aggiornamenti" says when a newer release is out.
