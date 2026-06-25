# SF-Record-Deleter ⚡️

[![Chrome Web Store](https://img.shields.io/badge/chrome--extension-ready-blue)](#)
[![Salesforce API](https://img.shields.io/badge/Salesforce-API_v58.0-blueviolet)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A lightweight Chrome extension to bulk Delete, Insert, and Update Salesforce records directly from your browser using your current Salesforce session. Built for speed, safety, and simplicity. Ideal for admins and developers who need a quick record management tool without leaving the Salesforce tab.

---

## 🔥 Features
- Delete records by ID (supports 15 & 18 character IDs)
- Insert and Update records via JSON payloads
- Uses your current Salesforce session cookie — no extra auth steps
- Resilient: retry logic, per-record error handling (continues on failures)
- Cancel running operations anytime
- Attractive, color-coded UI buttons for Delete / Insert / Update

---

## 🖼️ Screenshot
*(Replace with actual screenshot or animated GIF)*

---

## 🚀 Quick Start

1. Clone the repo:
   ```bash
   git clone https://github.com/kaileyventures/SF-Record-Deleter.git
   cd SF-Record-Deleter
   ```

2. Load the extension in Chrome:
   - Go to chrome://extensions
   - Enable "Developer mode"
   - Click "Load unpacked" and select the repo folder

3. Open a Salesforce tab, then open the extension popup and follow the UI.

---

## 🧭 Usage

1. Open a Salesforce page (any salesforce.com / force.com domain).
2. Open the extension popup.
3. Choose action: Delete / Insert / Update.
4. Enter Object API Name (e.g., `Account`, `Lead__c`).
5. Paste data:
   - For Delete: newline- or comma-separated record IDs (15 or 18 chars)
   - For Insert/Update: JSON array of objects

6. Click the action button to start. Use "Cancel Operation" to abort.

---

## 📥 Examples

Delete (IDs, newline-separated):
```
001xx000003DGb1AAG
003xx000004TmiHAAS
```

Insert (JSON array):
```json
[
  { "Name": "Acme Corp", "Industry": "Technology" },
  { "Name": "Beta LLC", "Industry": "Finance" }
]
```

Update (JSON array — must include `Id`):
```json
[
  { "Id": "001xx000003DGb1AAG", "Industry": "Healthcare" },
  { "Id": "001xx000003DGb2AAG", "Industry": "Retail" }
]
```

---

## 🔒 Authentication & Security

- The extension reads the Salesforce session cookie (`sid`) from the active Salesforce tab — it does not ask for credentials.
- Keep your Salesforce session secure. Do not use the extension on shared/public machines.
- All requests are sent to the Salesforce REST API using the same domain your browser is on (domain normalization is handled).

---

## ⚙️ Implementation Notes

- API version used: v58.0 (configurable in `popup.js`)
- Retries and rate-limiting are built in:
  - Retry attempts: 3
  - Request delay: 100ms (between records)
- Error handling continues processing remaining records; failed records are reported at the end.

---

## 🛠️ Troubleshooting

- "Not on a Salesforce tab": Make sure you have an active tab with a Salesforce URL (salesforce.com / force.com).
- "Cookie 'sid' not found": Refresh the Salesforce tab and try again (session cookie must be present).
- JSON parsing errors: Ensure your JSON is a valid array. The extension will report the approximate line number of parse errors.
- If operations fail repeatedly, check API permissions for the user and network restrictions.

---

## 📣 Contributing

Contributions are welcome! Suggested ways to help:
- Add e2e tests for bulk operations
- Improve UI/UX and accessibility
- Support more Salesforce domain mappings or OAuth flows

Please open issues/PRs with clear descriptions and examples.

---

## 🧾 Changelog
See Git history for details. Keep the extension versioned in the manifest for release notes.

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙋 Contact

Built with ❤️ by the kaileyventures team.  
For feedback or help: open an issue on this repository.
