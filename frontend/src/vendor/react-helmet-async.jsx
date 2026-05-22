import React, { useEffect } from 'react';

export function HelmetProvider({ children }) {
  return children;
}

const managedSelector = '[data-jaya-helmet="true"]';

function applyHelmetChildren(children) {
  const nextNodes = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    if (child.type === 'title') {
      document.title = child.props.children || '';
      return;
    }

    const tagName = typeof child.type === 'string' ? child.type : null;
    if (!tagName) return;

    const element = document.createElement(tagName);
    Object.entries(child.props || {}).forEach(([key, value]) => {
      if (key === 'children' || value === undefined || value === null) return;
      if (key === 'className') {
        element.setAttribute('class', value);
        return;
      }
      element.setAttribute(key, value);
    });

    if (child.props.children) {
      element.textContent = Array.isArray(child.props.children)
        ? child.props.children.join('')
        : child.props.children;
    }

    element.setAttribute('data-jaya-helmet', 'true');
    nextNodes.push(element);
  });

  document.head.querySelectorAll(managedSelector).forEach((node) => node.remove());
  nextNodes.forEach((node) => document.head.appendChild(node));
}

export function Helmet({ children }) {
  useEffect(() => {
    applyHelmetChildren(children);
  }, [children]);

  return null;
}

export default { Helmet, HelmetProvider };
