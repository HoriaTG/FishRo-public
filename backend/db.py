import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)

# SessionLocal = "fabrica" de sesiuni DB (conexiuni)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base = clasa de baza pt toate tabelele (modelele) noastre
Base = declarative_base()
