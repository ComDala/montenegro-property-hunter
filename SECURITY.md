# Security policy

## Supported version

Security fixes are applied to the latest version on the default branch.

## Reporting a vulnerability

Please do not open a public issue containing credentials, private data or an exploitable proof of concept. Use GitHub's private vulnerability reporting feature when it is enabled for the repository.

Include the affected component, expected impact and safe reproduction steps. Do not access, modify or retain production data while investigating.

## Credential policy

This repository must never contain production tokens, Supabase secret/service-role keys, database passwords, HAR files, cookies, browser profiles, private CRM exports or live database dumps. Use `.env.example` only as a variable-name reference.
