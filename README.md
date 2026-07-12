<p align="center">
  <img src="icon48.png" alt="SF Record Deleter Logo" width="80" height="80">
</p>

<h1 align="center">⚡ SF Record Deleter</h1>

<p align="center">
  <a href="manifest.json"><img src="https://img.shields.io/badge/version-1.0-blueviolet?style=for-the-badge&logo=salesforce" alt="Version"></a>
  <a href="manifest.json"><img src="https://img.shields.io/badge/Manifest-V3-orange?style=for-the-badge&logo=googlechrome" alt="Manifest Version"></a>
  <a href="https://developer.chrome.com/docs/extensions"><img src="https://img.shields.io/badge/Platform-Chrome_Extension-blue?style=for-the-badge" alt="Platform"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License"></a>
</p>

An ultra-sleek, modular Chrome Extension designed for **Salesforce CRM** administrators and developers. It serves as a rapid record manager to perform bulk **Delete**, **Insert**, and **Update** pipelines directly from the browser popup using your active Salesforce browser session—without configuring integrations or sharing API credentials. Features an interactive dashboard, automatic Object Name prefix-resolution, cancellation control, and color-coded status tracking.

---

## 🌟 Key Features

*   ⚡ **Zero-Configuration Authentication**: Instantly securely inherits session cookies (`sid`) from active Salesforce tabs (supports standard, custom, My Domain, and Visualforce URLs).
*   🗑️ **Auto Prefix-Resolution**: Delete records by raw IDs; the extension dynamically queries Salesforce SObject metadata on the fly to match ID key-prefixes to correct Object API names automatically.
*   📤 **Bulk Insert & Update**: Input arrays of JSON records directly. Insert new entries, or patch existing ones using their `Id` fields.
*   🛑 **Abort & Control**: Cancel operations mid-stream with a single click of the pause/cancel button, allowing safe checkpoints.
*   🎨 **Interactive Color-Coded Logs**: Real-time status reporting with multi-color highlights:
    *   `Success` in **Green**
    *   `Already Deleted` in **Orange**
    *   `Failed` in **Red**
*   🚀 **Enterprise Resiliency**: Equipped with exponential backoff retry algorithms and configurable rate-limiting (100ms throttle by default).

---

<h2 align="center">🖼️ Screenshot</h2>

<p align="center">
  <img src="image.png" alt="SF Record Deleter Screenshot">
</p>

---

## 🚀 How It Works

```mermaid
flowchart TD
    subgraph Client [Chrome Extension UI]
        Input[User Input: Action, Object API Name, Data Payload]
        Validate{Validator: parsers.js}
        UI[Status Dashboard: Rich HTML Counters]
    end
    
    subgraph Auth [Security & Context Layer]
        Cookie[Chrome Cookies API: Read active tab context]
        Domain[Normalize Domain: Map Lightning/VF to MyDomain]
    end

    subgraph API [Salesforce REST Engine]
        Prefix[Prefix Resolver: Map ID prefixes to Object Names]
        Batch[HTTP Execution Queue: Rate-limiting & Backoff Retries]
    end

    Input --> Validate
    Validate -- Validated Payload --> Cookie
    Cookie --> Domain
    Domain -- Auth Token & Domain --> API
    API --> Prefix
    Prefix --> Batch
    Batch -- Real-Time Updates & Results --> UI
```

---

## 📂 Project Architecture

```
SF-Record-Deleter/
├── icon48.png               # Extension icon (48x48)
├── icon48.svg               # Vector source of extension icon
├── gemini-svg.svg           # Custom vector assets
├── popup.html               # Main popup structure, CSS styles & layout
├── popup.js                 # Main orchestrator & UI controller
├── src/                     # Modular business logic (ES Modules)
│   ├── api/
│   │   └── salesforce.js    # Cookie extractors, prefix mappings & execution flow
│   ├── config/
│   │   └── config.js        # Global configuration parameters & constants
│   └── utils/
│       └── parsers.js       # Payload parser, ID validator & logger helper
├── manifest.json            # Extension configuration manifest
└── README.md                # Documentation
```

---

## 📥 Input Formats

### 1. Delete (Comma- or Newline-separated IDs)
```text
001xx000003DGb1AAG
003xx000004TmiHAAS
```

### 2. Insert (JSON Array)
```json
[
  { "Name": "Acme Corp", "Industry": "Technology" },
  { "Name": "Cloud Solutions", "Industry": "Consulting" }
]
```

### 3. Update (JSON Array with `Id` fields)
```json
[
  { "Id": "001xx000003DGb1AAG", "Industry": "Healthcare" },
  { "Id": "001xx000003DGb2AAG", "Industry": "Finance" }
]
```

---

## 🛠️ Installation & Setup

1.  Clone this repository locally:
    ```bash
    git clone https://github.com/kaileyventures/SF-Record-Deleter.git
    ```
2.  Open **Google Chrome** and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (toggle in the top-right corner).
4.  Click on **Load unpacked** (top-left corner).
5.  Select the `SF-Record-Deleter` root folder.
6.  Open a Salesforce tab in Chrome, click the extension icon, and begin processing records!

---

## 💡 Tech Stack

*   **HTML5 / CSS3** – Glassmorphic style design with responsive layouts and customized color accents.
*   **JavaScript (ES Modules)** – Modern modular design allowing clean, componentized logic importing.
*   **Salesforce REST API** – Integration with SObjects REST endpoints (using `v58.0` metadata endpoints).
*   **Chrome Extension API (MV3)** – Manifest V3 compliant popup scripts and session permission scopes.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
