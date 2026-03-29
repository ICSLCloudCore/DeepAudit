import sys
from loguru import logger

logger.remove()
logger.add(sys.stdout, 
           format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
                  "<level>{level:<8}</level> | "
                  "<cyan>{function}:{line}</cyan> - <level>{message}</level>",
           level="DEBUG",
           colorize=True)
