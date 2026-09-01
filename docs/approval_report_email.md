# Approval report email

After each manual or automatic approval, the application emails a CSV snapshot for the 21st–20th cutoff period containing the approved leave's start date.

Configuration belongs in `config/app.local.json`:

```json
{
  "approval_report_email_enabled": true
}
```

An administrator selects recipients in each employee's Details page by ticking “Receive CSV report when leave is approved”. Only selected, active employees receive the attachment. Set `approval_report_email_enabled` to `false` to disable these backup emails. Normal supervisor notifications continue to follow `send_emails`.
