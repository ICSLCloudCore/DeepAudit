from PIL import Image, ImageDraw, ImageFont, ImageColor
import os


def create_logo():
    size = 512
    img = Image.new("RGB", (size, size), "#071828")
    draw = ImageDraw.Draw(img)

    for i in range(0, size, 20):
        draw.line([(i, 0), (i, size)], fill=(255, 255, 255, 25), width=1)
        draw.line([(0, i), (size, i)], fill=(255, 255, 255, 25), width=1)

    pixel_color = ImageColor.getrgb("#38bdf8")
    draw.rectangle([4, 4, 16, 16], fill=pixel_color)
    draw.rectangle([496, 4, 508, 16], fill=pixel_color)
    draw.rectangle([4, 496, 16, 508], fill=pixel_color)
    draw.rectangle([496, 496, 508, 508], fill=pixel_color)

    shield_x, shield_y = 85, 60
    shield_points = [
        (shield_x + 171, shield_y + 20),
        (shield_x + 256, shield_y + 50),
        (shield_x + 256, shield_y + 120),
        (shield_x + 256, shield_y + 210),
        (shield_x + 210, shield_y + 310),
        (shield_x + 171, shield_y + 325),
        (shield_x + 132, shield_y + 310),
        (shield_x + 86, shield_y + 260),
        (shield_x + 86, shield_y + 210),
        (shield_x + 86, shield_y + 120),
        (shield_x + 86, shield_y + 50),
        (shield_x + 171, shield_y + 20),
    ]
    draw.polygon(shield_points, fill="#38bdf8", outline="#38bdf8", width=3)

    draw.ellipse(
        [shield_x + 100, shield_y + 100, shield_x + 170, shield_y + 180], fill="white"
    )
    draw.ellipse(
        [shield_x + 172, shield_y + 100, shield_x + 242, shield_y + 180], fill="white"
    )

    draw.ellipse(
        [shield_x + 122, shield_y + 127, shield_x + 158, shield_y + 163], fill="#071828"
    )
    draw.ellipse(
        [shield_x + 194, shield_y + 127, shield_x + 230, shield_y + 163], fill="#071828"
    )

    draw.ellipse(
        [shield_x + 127, shield_y + 132, shield_x + 139, shield_y + 144], fill="white"
    )
    draw.ellipse(
        [shield_x + 199, shield_y + 132, shield_x + 211, shield_y + 144], fill="white"
    )

    draw.ellipse(
        [shield_x + 156, shield_y + 187, shield_x + 186, shield_y + 203], fill="#071828"
    )

    mag_x, mag_y = 330, 280
    draw.ellipse(
        [mag_x + 15, mag_y + 15, mag_x + 85, mag_y + 85], outline="#38bdf8", width=6
    )
    draw.line(
        [(mag_x + 75, mag_y + 75), (mag_x + 105, mag_y + 105)], fill="#38bdf8", width=6
    )

    circuit_color = ImageColor.getrgb("#38bdf8")
    draw.line(
        [(50, 150), (80, 150), (80, 180), (120, 180)], fill=circuit_color, width=2
    )
    draw.line(
        [(390, 150), (360, 150), (360, 180), (320, 180)], fill=circuit_color, width=2
    )
    draw.line(
        [(50, 360), (80, 360), (80, 330), (120, 330)], fill=circuit_color, width=2
    )
    draw.line(
        [(390, 360), (360, 360), (360, 330), (320, 330)], fill=circuit_color, width=2
    )

    badge_x, badge_y = 206, 380
    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + 100, badge_y + 45], radius=8, fill="#38bdf8"
    )

    try:
        font = ImageFont.truetype("arialbd.ttf", 24)
    except:
        font = ImageFont.load_default()

    text_bbox = draw.textbbox((0, 0), "GO", font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    draw.text(
        (badge_x + 50 - text_width / 2, badge_y + 22 - text_height / 2),
        "GO",
        fill="#071828",
        font=font,
    )

    output_path = os.path.join(
        os.path.dirname(__file__), "public", "logo_godeepaudit.png"
    )
    img.save(output_path, "PNG")
    print(f"Logo saved to {output_path}")


if __name__ == "__main__":
    create_logo()
