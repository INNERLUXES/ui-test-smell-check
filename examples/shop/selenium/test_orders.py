import time

import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

order_id = None


@pytest.fixture
def driver():
    driver = webdriver.Firefox()
    driver.implicitly_wait(5)
    yield driver
    driver.quit()


def test_sign_in(driver):
    driver.get("http://localhost:8080/sign-in")
    driver.find_element(By.ID, "username").send_keys("ada")
    driver.find_element(By.XPATH, "/html/body/div[2]/form/button").click()
    time.sleep(2)
    WebDriverWait(driver, 10).until(EC.title_contains("Account"))


def test_place_order(driver):
    global order_id
    driver.find_element(By.CLASS_NAME, "css-9z8y7x6").click()
    order_id = driver.find_element(By.CSS_SELECTOR, "[data-test=order-id]").text


@pytest.mark.order(3)
def test_order_in_history(driver):
    # time.sleep(1) in a comment is not code, and is not reported.
    rows = driver.find_elements(By.CSS_SELECTOR, "table.orders tr")
    assert any(order_id in row.text for row in rows)
