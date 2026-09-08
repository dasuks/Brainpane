# Install Brainpane from GitHub

For people and coding agents asked to install this repository. Brainpane is an MIT local terminal program plus explicit skills, not just a SKILL.md download. Follow the user's requested installation scope; do not claim that a skill can split an already-running unwrapped CLI.

## Inspect first

Confirm the requested repository is `https://github.com/dasuks/Brainpane`, read README, and check the OS, shell, Node/npm, Git and installed Codex/Claude. Reuse an existing checkout when appropriate. Do not overwrite unrelated directories. Node must be at least 22.12. CLI login remains in the original CLI; never read or copy authentication files.

## Install from source

Choose a stable folder the user will keep. PowerShell example:

```powershell
git clone https://github.com/dasuks/Brainpane.git "$env:LOCALAPPDATA\Brainpane\source"
Set-Location "$env:LOCALAPPDATA\Brainpane\source"
npm ci
npm run build
npm run setup -- --shell powershell
```

bash/zsh example:

```sh
git clone https://github.com/dasuks/Brainpane.git "$HOME/.local/share/brainpane"
cd "$HOME/.local/share/brainpane"
npm ci
npm run build
npm run setup -- --shell bash
# Or --shell zsh
```

Stop if a command fails. No npm-registry release is assumed. Do not pipe an uninspected remote script into a shell, change execution policy, add a provider API key, disable CLI approvals, or replace the CLI executable. If node-pty has no suitable prebuild, follow its [official prerequisites](https://github.com/microsoft/node-pty#dependencies) for the actual platform.

Setup installs user skills for both CLIs and adds a marked profile block. It queries `$PROFILE.CurrentUserAllHosts` for installed Windows PowerShell/PowerShell 7, including redirected Documents folders. Use `--profile <exact-path>` for a particular profile; `--home <path>` supports isolated tests. bash defaults to `.bashrc`; select the correct profile explicitly if a login shell does not source it. Existing same-named aliases/functions remain active and produce a warning.

Keep the checkout at its installed location. `npm link` is optional because the profile provides a `brainpane` function. No persistent OS daemon is installed; the internal service runs only with the CLI wrapper.

## Verify in a new terminal

Existing shells/CLIs do not acquire functions retroactively. In a **new** PowerShell terminal:

```powershell
Get-Command codex,claude,brainpane | Select-Object Name,CommandType
brainpane doctor
codex --version
claude --version
```

The commands should be functions unless a name conflict was preserved. For bash/zsh use `type codex claude brainpane`. `-NoProfile` and absolute executable paths bypass the integration.

Run ordinary `codex` or `claude` in a working folder. Talk normally, then invoke `$brainpane start` / `/brainpane start`. Check: no map before activation; prior public topics appear after activation; clicking left restores typing; stop closes the panel while chat continues. This optional model test uses existing CLI usage. Deterministic tests do not prove semantic interpretation.

Older project skills can shadow or duplicate the new user skill. Inspect before removing/updating them; never delete a customized skill to force discovery. New user skills are in `~/.agents/skills/brainpane` and `~/.claude/skills/brainpane`, with initial implicit invocation disabled.

## Update

From the installed checkout:

```text
git pull --ff-only
npm ci
npm run build
npm run setup
```

Setup updates only unchanged managed skills and its intact profile block. Text outside the block remains. If a managed file was edited, it refuses and identifies the file; reconcile deliberately. Rerun setup after relocating Node or the checkout. Restart terminal and CLI after updates.

## Uninstall or bypass

```text
brainpane uninstall
```

Only owned, unmodified skills and the intact marked block are removed. Other profile edits, modified managed files, CLI installation/login and all map data remain. Open a new terminal afterwards; already-loaded functions stay until their shell exits. If the function cannot run, use `node bin/brainpane.mjs uninstall` from the installed checkout.

Temporary bypass: `$env:BRAINPANE_DISABLE='1'` before launching in PowerShell; remove that variable to re-enable. In bash/zsh use `BRAINPANE_DISABLE=1 codex`. Noninteractive calls and nested CLI tools already bypass the compositor. CMD, fish, custom aliases and apps launching executable paths directly have no automatic integration in this preview; direct `brainpane run --dormant -- codex` remains available.

Ownership is recorded in `~/.brainpane/installation.json`. An owner-only `setup-recovery.json` records previous file bytes during installation and is removed on success. After an interrupted setup, run `brainpane recover`; it refuses a live setup lock and restores only intact installation writes, preserving later edits. Then rerun setup. Do not publish recovery journals or profiles in bug reports.

## Report honestly

Tell the user the connected shell, installed files, start/stop and uninstall commands. Separate build/file tests from real interactive tests. Do not claim all compressed history is recoverable, every turn is guaranteed, all terminals work, or extra token use is zero.

Official references: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude skills](https://code.claude.com/docs/en/skills), [PowerShell profiles](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_profiles).
