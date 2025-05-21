# **media Plugin for TSDIAPI**

A TSDIAPI plugin to extend API functionality with media.

## 📌 About

This is a **TSDIAPI** plugin designed to extend your server functionality. TSDIAPI is a modular framework that allows you to build scalable APIs with dynamic plugin support.

🔗 **TSDIAPI CLI:** [@tsdiapi/cli](https://www.npmjs.com/package/@tsdiapi/cli)

---

## 📦 Installation

You can install this plugin using npm:

```bash
npm install --save @tsdiapi/media
```

Then, register the plugin in your TSDIAPI project:

```typescript
import { createApp } from "@tsdiapi/server";
import createPlugin from "@tsdiapi/media";

createApp({
    plugins: [createPlugin()]
});
```

---

## 🚀 Features

- 🛠 **Extend TSDIAPI** with additional functionalities.
- ⚙ **Seamless integration** with your existing API.
- 🏗 **Fully configurable** to match your project needs.

---

## 🔧 Configuration

This plugin can be configured via options when initializing:

```typescript
createPlugin({
});
```

| Option            | Type   | Default | Description |
|------------------|-------|---------|-------------|

---

## 📌 How to Use

After installation, you can use this plugin as part of your **TSDIAPI** application. If additional configuration is required, it can be passed as an object when initializing the plugin.

### Example Usage:

```typescript
import { createApp } from "@tsdiapi/server";
import createPlugin from "@tsdiapi/media";

const app = createApp({
    plugins: [createPlugin({
    })]
});

app.start();
```

---

## 🔗 Related Plugins

You can find more **TSDIAPI** plugins here:  
🔗 [Available Plugins](https://www.npmjs.com/search?q=%40tsdiapi)

---

## 👨‍💻 Contributing

Contributions are always welcome! If you have ideas for improving this plugin, feel free to open a pull request.

**Author:** unbywyd  
**GitHub Repository:** [https://github.com/unbywyd/tsdiapi-media.git](https://github.com/unbywyd/tsdiapi-media.git)  

📧 **Contact:** unbywyd@gmail.com

🚀 Happy coding with **TSDIAPI**! 🎉
