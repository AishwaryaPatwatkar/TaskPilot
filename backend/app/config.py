from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    database_url: str = (
        "postgresql+asyncpg://taskpilot:taskpilot@localhost:5432/taskpilot"
    )
    database_url_sync: str = (
        "postgresql+psycopg2://taskpilot:taskpilot@localhost:5432/taskpilot"
    )

    # HTTP Basic Auth
    basic_auth_username: str = "admin"
    basic_auth_password: str = "changeme"

    # Worker
    worker_poll_interval: int = 60  # seconds
    max_retries: int = 3

    # App
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
