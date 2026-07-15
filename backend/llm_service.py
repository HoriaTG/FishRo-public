import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

MODEL_NAME = os.getenv(
    "LLM_MODEL",
    "llama-3.1-8b-instant"
)


def ask_llm(system_prompt: str, user_message: str) -> str:
    if client is None:
        return (
            "Momentan FishBot nu este configurat. "
            "Lipsește cheia GROQ_API_KEY din fișierul .env."
        )

    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_message,
                },
            ],
            temperature=0.7,
            max_tokens=500,
        )

        return completion.choices[0].message.content.strip()

    except Exception as e:
        print("LLM ERROR:", e)
        return (
            "Momentan FishBot întâmpină o problemă temporară. "
            "Te rog încearcă din nou puțin mai târziu."
        )
