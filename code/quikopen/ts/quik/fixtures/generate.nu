# Synthetic, original decoder fixtures. Requires ffmpeg and libwebp tools.
def main [] {
    cd $env.FILE_PWD
    let temp = (mktemp -d)
    try {
        for item in [[n rgb]; [0 "255 0 0"] [1 "0 0 255"]] {
            let pixels = (0..767 | each {|i| if ($i mod 32) < 16 { $item.rgb } else { "0 0 0" } } | str join " ")
            $"P3\n32 24\n255\n($pixels)\n" | save ($temp | path join $"frame-($item.n).ppm")
            ^ffmpeg -v error -y -i ($temp | path join $"frame-($item.n).ppm") ($temp | path join $"frame-($item.n).png")
            if $env.LAST_EXIT_CODE != 0 { error make {msg: "PNG encoding failed"} }
        }
        ^ffmpeg -v error -y -i ($temp | path join frame-0.png) -vf "colorkey=black:0.01:0,format=rgba" transparent.png
        ^ffmpeg -v error -y -i ($temp | path join frame-0.png) -q:v 1 sample.jpg
        cp sample.jpg sample.jpeg
        let jpeg = (open --raw sample.jpg)
        [($jpeg | bytes at 0..1) 0x[FF E1 00 22 45 78 69 66 00 00 4D 4D 00 2A 00 00 00 08 00 01 01 12 00 03 00 00 00 01 00 06 00 00 00 00 00 00] ($jpeg | bytes at 2..)] | bytes collect | save --force oriented.jpg
        ^ffmpeg -v error -y -framerate 2 -i ($temp | path join "frame-%d.png") -loop 0 animated.gif
        ^cwebp -quiet -lossless ($temp | path join frame-0.png) -o opaque.webp
        ^cwebp -quiet -lossless transparent.png -o transparent.webp
        ^img2webp -loop 0 -lossless -d 500 ($temp | path join frame-0.png) -d 500 ($temp | path join frame-1.png) -o animated.webp
        for item in [[name width height]; [wide 2000 200] [tall 200 2000] [huge 2000 2000]] {
            ^ffmpeg -v error -y -i ($temp | path join frame-0.png) -vf $"scale=($item.width):($item.height):flags=neighbor" $"($item.name).png"
            if $env.LAST_EXIT_CODE != 0 { error make {msg: "Size fixture encoding failed"} }
        }
    } catch {|err| rm -rf $temp; error make {msg: $err.msg} }
    rm -rf $temp
}
