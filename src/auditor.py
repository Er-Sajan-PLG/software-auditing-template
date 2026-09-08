"""Software Auditing Template - Main entry point for Python."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Literal


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OutputFormat(str, Enum):
    JSON = "json"
    MARKDOWN = "markdown"
    HTML = "html"


@dataclass
class AuditConfig:
    target_path: Path
    rules: list[str] = field(default_factory=list)
    output_format: OutputFormat = OutputFormat.JSON
    severity_threshold: Severity = Severity.LOW


@dataclass
class AuditIssue:
    file: str
    line: int
    column: int
    rule: str
    severity: Severity
    message: str
    suggestion: str | None = None


@dataclass
class AuditSummary:
    total_files: int = 0
    issues_found: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0


@dataclass
class AuditResult:
    summary: AuditSummary = field(default_factory=AuditSummary)
    issues: list[AuditIssue] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_json(self) -> str:
        return json.dumps(self, default=lambda o: o.__dict__, indent=2)


class Auditor:
    """Main auditor class - to be implemented by agents."""

    def __init__(self, config: AuditConfig) -> None:
        self.config = config

    async def run(self) -> AuditResult:
        """Run the audit. Implementation will be added by agents."""
        return AuditResult()