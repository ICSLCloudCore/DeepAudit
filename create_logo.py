from PIL import Image, ImageDraw, ImageFont
import os


def create_logo(size, output_path):
    # Create a square image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = size / 512

    # Draw rounded square background
    bg_color = (255, 107, 44, 255)  # #FF6B2C
    radius = int(40 * scale)
    draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=bg_color)

    # Draw three bars
    bar_width = int(85 * scale)
    bar_gap = int(35 * scale)
    start_x = int(80 * scale)
    base_y = int(size - 80 * scale)

    # Bar 1 - left, tallest
    bar1_height = int(280 * scale)
    draw.rectangle(
        [(start_x, base_y - bar1_height), (start_x + bar_width, base_y)],
        fill=(255, 255, 255, 255),
    )

    # Bar 2 - middle, medium
    bar2_height = int(200 * scale)
    draw.rectangle(
        [
            (start_x + bar_width + bar_gap, base_y - bar2_height),
            (start_x + 2 * bar_width + bar_gap, base_y),
        ],
        fill=(255, 255, 255, 230),
    )

    # Bar 3 - right, shorter
    bar3_height = int(240 * scale)
    draw.rectangle(
        [
            (start_x + 2 * (bar_width + bar_gap), base_y - bar3_height),
            (start_x + 3 * bar_width + 2 * bar_gap, base_y),
        ],
        fill=(255, 255, 255, 180),
    )

    # Try to add "G" text
    try:
        # Try different font sizes and paths
        font_size = int(120 * scale)
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            try:
                font = ImageFont.truetype("Arial.ttf", font_size)
            except:
                try:
                    font = ImageFont.truetype(
                        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                        font_size,
                    )
                except:
                    font = ImageFont.load_default()

        text = "G"
        # Calculate text position
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        text_x = int(size - 90 * scale - text_width / 2)
        text_y = int(size / 2 - text_height / 2)

        draw.text((text_x, text_y), text, fill=(255, 255, 255, 255), font=font)
    except Exception as e:
        print(f"Could not add text: {e}")

    # Save the image
    img.save(output_path, "PNG")
    print(f"Created logo: {output_path}")


# Create logos in different sizes
sizes = [512, 256, 128, 64, 32]
output_dir = r"C:\Users\40990\Documents\DeepAudit\frontend\public"

for size in sizes:
    output_path = os.path.join(output_dir, f"logo_godeepaudit_{size}x{size}.png")
    create_logo(size, output_path)

# Also create the main logo file (copy 256x256)
main_logo_path = os.path.join(output_dir, "logo_godeepaudit.png")
if os.path.exists(os.path.join(output_dir, "logo_godeepaudit_256x256.png")):
    img = Image.open(os.path.join(output_dir, "logo_godeepaudit_256x256.png"))
    img.save(main_logo_path, "PNG")
    print(f"Created main logo: {main_logo_path}")

print("Logo creation complete!")
