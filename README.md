# Quikopen

Open SVG files inside Astrohacker TermSurf. The overlay shows the drawing at
its natural size in a centered card.

Quikopen is installed separately. Opening a file currently requires Astrohacker
TermSurf. Support for other terminals is not implemented here.

## Installation

Install from the shared Astrohacker Homebrew tap on an Apple-silicon Mac running macOS 26 or newer:

```
brew trust astrohackerlabs/astrohacker
brew tap astrohackerlabs/astrohacker
brew install quikopen
quikopen --version
quikopen --help
```

Install Astrohacker TermSurf separately. The formula does not install or own
TermSurf. Running this prebuilt package does not require Bun or Node.

Inside an Astrohacker TermSurf pane:

```
quikopen drawing.svg
```

Identity/help work outside TermSurf; opening a file does not.

## Build from source

See AGENTS.md in this repository.
