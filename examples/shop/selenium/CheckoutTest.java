package shop.checkout;

import java.time.Duration;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.ui.WebDriverWait;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CheckoutTest {
  private WebDriver driver;

  @FindBy(xpath = "//div[@class='summary']/span[3]")
  private WebElement total;

  @Test
  @Order(1)
  void addsTheShippingAddress() throws InterruptedException {
    driver.findElement(By.id("street")).sendKeys("1 Market Square");
    driver.findElement(By.cssSelector("#shipping-form button[type=submit]")).click();
    Thread.sleep(1500);
  }

  @Test
  @Order(2)
  void paysByCard() {
    new WebDriverWait(driver, Duration.ofSeconds(10)).until(d -> d.findElement(By.id("card-number")).isDisplayed());
    driver.findElement(By.className("btn-primary")).click();
    /* Thread.sleep(500) in a comment is not code. */
  }
}
