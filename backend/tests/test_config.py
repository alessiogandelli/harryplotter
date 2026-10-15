from pathlib import Path

from app import config


def test_env_file_populates_config(tmp_path: Path, monkeypatch) -> None:
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=from-dotenv\nFIGURELAB_PROVIDER=decisions\n")

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("FIGURELAB_PROVIDER", raising=False)

    config.load_env_files([env])

    assert config.openai_api_key() == "from-dotenv"
    assert config.provider_mode() == "decisions"


def test_real_environment_wins_over_env_file(tmp_path: Path, monkeypatch) -> None:
    env = tmp_path / ".env"
    env.write_text("FIGURELAB_PROVIDER=structured\n")

    monkeypatch.setenv("FIGURELAB_PROVIDER", "fake")
    config.load_env_files([env])

    assert config.provider_mode() == "fake"
