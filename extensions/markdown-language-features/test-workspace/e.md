# Markdown Features Test

This file is used to test the following features of the Markdown extension:

1. **The language label** in the top left corner of code blocks
2. **The table of contents** in the top right corner of the editor

---

## 1. PHP Code Block

### 1.1. Basic Syntax

#### 1.1.1. Short Tags

##### 1.1.1.1. Quick Inlining

###### 1.1.1.1.1. Minimal Example

```php
<?= 'hello' ?>

```

#### 1.1.2. Advanced Structure

##### 1.1.2.1. Object-Oriented

###### 1.1.2.1.1. Class Declaration

```php
namespace App\Test;

class Greeter {
    public function sayHello(): string {
        return 'hello';
    }
}

```

---

## 2. JavaScript Code Block

### 2.1. Modern ES6+

#### 2.1.1. Arrow Functions

##### 2.1.1.1. Scope and Context

###### 2.1.1.1.1. Interactive Example

```javascript
const greeting = (name) => `Hello, ${name}!`;
console.log(greeting('world'));

```

### 2.2. Asynchrony

#### 2.2.1. Promises and Async/Await

##### 2.2.1.1. Network Requests

###### 2.2.1.1.1. Fetch API

```javascript
async function fetchData(url) {
  const res = await fetch(url);
  return res.json();
}

```

---

## 3. Plain Code Block (No Language)

### 3.1. Raw Rendering

#### 3.1.1. Lack of Syntax Highlighting

##### 3.1.1.1. Label Verification

###### 3.1.1.1.1. Behavior Test

```
This block has no specified language.
It should NOT display a language label.

```

---

## 4. Full Heading Levels Exploration

### 4.1. Level 2 Subsection (Start of Hierarchy)

#### 4.1.1. Level 3 Sub-subsection

##### 4.1.1.1. Intermediate Level 4

###### 4.1.1.1.1. Advanced Level 5

###### 4.1.1.1.2. Terminal Level 6

### 4.2. Second Test Branch

#### 4.2.1. TOC Indentation Test

##### 4.2.1.1. Visual Alignment

###### 4.2.1.1.1. Graphical Validation of Sub-levels

---

## 5. Filler Text for Scrolling

### 5.1. Introductory Paragraph

#### 5.1.1. Lorem Ipsum Block 1

##### 5.1.1.1. Content Details

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

#### 5.1.2. Lorem Ipsum Block 2

##### 5.1.2.1. Continued Content

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

---

## 6. Another Section

### 6.1. TOC Anchor Validation

#### 6.1.1. Click Test

##### 6.1.1.1. Viewport Positioning

###### 6.1.1.1.1. Scroll Margin Verification

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

---

## 7. Final Section

### 7.1. Test Conclusion

#### 7.1.1. Final Checklist

##### 7.1.1.1. Feature Status

* [ ] PHP label present
* [ ] JS label present
* [ ] Raw block without label
* [ ] Floating TOC scroll-reactive
* [ ] Hierarchy up to H6 properly indented
