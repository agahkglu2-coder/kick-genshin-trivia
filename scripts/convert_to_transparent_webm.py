import os
import sys
import subprocess

def convert_green_to_alpha_webm(input_video_path, output_webm_path, cut_bottom=80, similarity=0.26, blend=0.08):
    """
    Converts green-screen video to 100% transparent alpha WebM using VP9 yuva420p.
    Optionally masks or cuts the bottom UI artifacts (Level 90 bar / UID).
    """
    if not os.path.exists(input_video_path):
        print(f"Error: {input_video_path} does not exist.")
        return False
        
    vf_filters = [
        f"drawbox=x=0:y={720-cut_bottom}:w=1280:h={cut_bottom}:color=0x009a04@1:t=fill",
        f"colorkey=color=0x009a04:similarity={similarity}:blend={blend}",
        "despill=green:type=1",
        "format=yuva420p"
    ]
    
    cmd = [
        "ffmpeg", "-y",
        "-i", input_video_path,
        "-vf", ",".join(vf_filters),
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0",
        "-b:v", "2M",
        "-threads", "4",
        output_webm_path
    ]
    print("Running:", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("FFmpeg stderr:", res.stderr)
        return False
    print(f"Successfully created transparent WebM: {output_webm_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 2:
        convert_green_to_alpha_webm(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python convert_to_transparent_webm.py <input> <output>")
