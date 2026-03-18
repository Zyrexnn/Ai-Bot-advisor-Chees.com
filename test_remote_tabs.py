import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

def test_connection():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    try:
        driver = webdriver.Chrome(options=options)
        handles = driver.window_handles
        print(f"Found {len(handles)} tabs")
        for i, handle in enumerate(handles):
            try:
                driver.switch_to.window(handle)
                print(f"Tab {i}: {driver.current_url} - {driver.title}")
            except Exception as e:
                print(f"Tab {i} error: {e}")
        
    except Exception as e:
        print(f"Chrome connection error: {e}")

if __name__ == '__main__':
    test_connection()
