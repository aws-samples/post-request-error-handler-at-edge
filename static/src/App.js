// React SPA Implementation
import React, { useEffect, useState } from "react";
import "./App.css"; // Import the CSS file

const App = () => {

  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch('/config.json')
      .then((response) => response.json())
      .then((data) => setConfig(data))
      .catch((error) => console.error('Failed to load config:', error));
  }, []);

  // State to store user input and responses
  const [singleDomainName, setSingleDomainName] = useState("");
  const [differentDomainName, setDifferentDomainName] = useState("");
  const [singleDomainResponse, setSingleDomainResponse] = useState("");
  const [differentDomainResponse, setDifferentDomainResponse] = useState("");

  // Helper function to validate the name format
  const validateName = (name) => {
    const nameRegex = /^[a-zA-Z]+(?: [a-zA-Z]+){0,2}$/;
    return nameRegex.test(name) && name.length <= 30;
  };

  // Submit handler for single domain
  const handleSingleDomainSubmit = async () => {
    if (!singleDomainName) {
      alert("Please input your name.");
      return;
    }
    if (!validateName(singleDomainName)) {
      alert("Invalid name format. Only letters and up to two spaces are allowed, max 30 characters.");
      return;
    }
    try {
      const response = await fetch(config.REACT_APP_FRONTEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: singleDomainName }),
      });
      const data = await response.json();
      setSingleDomainResponse(data.message);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to send request.");
    }
  };

  // Submit handler for different domain
  const handleDifferentDomainSubmit = async () => {
    if (!differentDomainName) {
      alert("Please input your name.");
      return;
    }
    if (!validateName(differentDomainName)) {
      alert("Invalid name format. Only letters and up to two spaces are allowed, max 30 characters.");
      return;
    }
    try {
      const response = await fetch(config.REACT_APP_BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: differentDomainName }),
        credentials: "include",
      });
      const data = await response.json();
      setDifferentDomainResponse(data.message);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to send request.");
    }
  };

  return (
    <div className="App">
      <h1>Say Hi</h1>
      <div className="container">
        {/* Single Domain Section */}
        <div className="canvas">
          <h2>Single domain</h2>
          <h2>What’s your name?</h2>
          <input
            type="text"
            value={singleDomainName}
            onChange={(e) => setSingleDomainName(e.target.value)}
            placeholder="Enter your name"
          />
          <button onClick={handleSingleDomainSubmit}>Submit</button>
          <p className="response">{singleDomainResponse}</p>
        </div>

        {/* Different Domain Section */}
        <div className="canvas">
          <h2>Different domain</h2>
          <h2>What’s your name?</h2>
          <input
            type="text"
            value={differentDomainName}
            onChange={(e) => setDifferentDomainName(e.target.value)}
            placeholder="Enter your name"
          />
          <button onClick={handleDifferentDomainSubmit}>Submit</button>
          <p className="response">{differentDomainResponse}</p>
        </div>
      </div>
    </div>
  );
};

export default App;
