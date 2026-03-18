import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

def run():
    options = uc.ChromeOptions()
    options.add_argument("--disable-notifications")
    options.add_argument("--headless") # Run headless so we don't bother user
    try:
        driver = uc.Chrome(options=options, version_main=145)
        driver.get("https://www.chess.com/play/computer")
        time.sleep(10) # Wait for load and potential modals
        with open("dom.txt", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("DOM captured successfully")
    except Exception as e:
        print("Failed:", str(e))
    finally:
        try:
            driver.quit()
        except:
            pass

if __name__ == '__main__':
    run()
