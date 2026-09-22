import smtplib
from email.message import EmailMessage
from .config import get_settings

def send_password_reset_email(*, recipient: str, recipient_name: str, reset_url: str, expires_minutes: int) -> None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP password reset delivery is not configured")

    message = EmailMessage()
    message["Subject"] = "Reset your Central Auth password"
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = recipient
    message.set_content(
        f"Hello {recipient_name},\n\n"
        f"Use the link below to reset your Central Auth password. This link expires in {expires_minutes} minutes and can only be used once.\n\n"
        f"{reset_url}\n\n"
        "If you did not request a password reset, you can safely ignore this email.\n"
    )

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password or "")
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        server.ehlo()
        if settings.smtp_use_tls:
            server.starttls()
            server.ehlo()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)
