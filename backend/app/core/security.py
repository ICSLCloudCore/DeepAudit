from datetime import datetime, timedelta, timezone
from typing import Any, Union
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

# 兼容性补丁：修复bcrypt 4.x与passlib的兼容性问题
try:
    import bcrypt

    if not hasattr(bcrypt, "__about__"):
        # 为bcrypt 4.x添加__about__属性
        class _About:
            __version__ = getattr(bcrypt, "__version__", "4.0.0")

        bcrypt.__about__ = _About()
except ImportError:
    pass

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = settings.ALGORITHM


def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
