FROM nginx:1.25-alpine

# Add metadata
LABEL maintainer="your-email@example.com"

# Copy application files
COPY . /usr/share/nginx/html

# Copy nginx config template (${PORT} is substituted at container startup)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Redirect logs to stdout/stderr for Cloud Logging
RUN ln -sf /dev/stdout /var/log/nginx/access.log && \
    ln -sf /dev/stderr /var/log/nginx/error.log

EXPOSE 8080

# Substitute $PORT at runtime, then start nginx
CMD ["sh", "-c", "envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]