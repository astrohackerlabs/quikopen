def main [] {
    let fixtures = $env.FILE_PWD
    let binary = ($fixtures | path join ../dist/quikopen | path expand)
    if ($env.TERMSURF_SOCKET? | is-empty) or ($env.TERMSURF_PANE_ID? | is-empty) {
        error make {msg: "Run this smoke inside Astrohacker TermSurf."}
    }
    print $"Binary: ($binary)"
    print $"SHA-256: (open --raw $binary | hash sha256)"
    for item in [
        [sample.svg "32×32 SVG regression; exit with Esc"]
        [sample.jpg "32×24 JPEG, red left / black right; exit with Ctrl+C"]
        [sample.jpeg "same JPEG via .jpeg suffix; exit with the × button"]
        [oriented.jpg "24×32 oriented JPEG, red top / black bottom"]
        [transparent.png "32×24 PNG; red left, transparent right; try all three backgrounds"]
        [animated.gif "32×24 GIF; left alternates red/blue every 500 ms; watch multiple cycles"]
        [opaque.webp "32×24 WebP, red left / black right"]
        [transparent.webp "32×24 WebP; red left, transparent right; try all backgrounds"]
        [animated.webp "32×24 WebP; left alternates red/blue every 500 ms"]
        [wide.png "2000×200; scroll horizontally inside the stage"]
        [tall.png "200×2000; scroll vertically inside the stage"]
        [huge.png "2000×2000; scroll both directions inside the stage"]
        [a-very-long-quikopen-filename-that-needs-the-full-card-row.svg "long filename has its own row"]
    ] {
        print $"($item.0): ($item.1). Close this viewer to continue."
        ^$binary ($fixtures | path join $item.0)
        if $env.LAST_EXIT_CODE != 0 { error make {msg: $"Smoke failed opening ($item.0)"} }
    }
    print "Record observations, then check concurrent SVG/PNG in two panes. This script does not mark the experiment Pass."
}
