import pygame

# Initialize Pygame
pygame.init()

# Set up the screen
screen_width = 640
screen_height = 480
screen = pygame.display.set_mode((screen_width, screen_height))
pygame.display.set_caption("Pac-Man Clone")

# Set up the game clock
clock = pygame.time.Clock()

# Load images
pacman_image = pygame.image.load("pacman.png").convert_alpha()

# Set up Pac-Man
pacman_x = screen_width / 2
pacman_y = screen_height / 2
pacman_speed = 5

# Game loop
while True:
    # Handle events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()

    # Move Pac-Man
    keys = pygame.key.get_pressed()
    if keys[pygame.K_LEFT]:
        pacman_x -= pacman_speed
    if keys[pygame.K_RIGHT]:
        pacman_x += pacman_speed
    if keys[pygame.K_UP]:
        pacman_y -= pacman_speed
    if keys[pygame.K_DOWN]:
        pacman_y += pacman_speed

    # Draw everything
    screen.fill((0, 0, 0))
    screen.blit(pacman_image, (pacman_x, pacman_y))
    pygame.display.flip()

    # Limit the frame rate
    clock.tick(60)
