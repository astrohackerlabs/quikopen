# QuikOpen

QuikOpen is an image viewer for Astrohacker TermSurf. Open SVG, JPEG (.jpg or
.jpeg), PNG, GIF and WebP files at their natural size in a centered card.
Animated GIF and WebP, transparent PNG and WebP, and JPEG orientation are
supported. Files can be up to 8 MiB.

QuikOpen is installed separately. Opening a file currently requires Astrohacker
TermSurf. Support for other terminals is not implemented here.

## Installation

Install from the shared Astrohacker Homebrew tap on an Apple-silicon Mac running macOS 26 or newer:

```nu
brew trust astrohackerlabs/astrohacker
brew tap astrohackerlabs/astrohacker
brew install quikopen
quikopen --version
quikopen --help
```

Install Astrohacker TermSurf separately. The formula does not install or own
TermSurf. Running this prebuilt package does not require Bun or Node.

Inside an Astrohacker TermSurf pane:

```nu
quikopen photo.jpg
quikopen transparent.png
quikopen animation.webp
quikopen drawing.svg
```

Identity/help work outside TermSurf; opening a file does not.

## Build from source

See AGENTS.md in this repository.
