import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import 'antd/dist/reset.css';
import App from './App.jsx';
import { AppProvider } from './AppContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider>
      <AntApp>
        <AppProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AppProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
