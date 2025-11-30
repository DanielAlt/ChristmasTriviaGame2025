const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    titleBarStyle: 'hidden'
  });

  win.loadFile('index.html')
}



app.whenReady().then(() => {
  createWindow()
})