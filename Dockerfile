FROM nginx:1.25-alpine

# OCI Image metadata labels
LABEL maintainer="your-email@example.com"
LABEL org.opencontainers.image.title="Dynamic Travel Engine PoC"
LABEL org.opencontainers.image.description="Real-time itinerary re-routing engine"
LABEL org.opencontainers.image.source="https://github.com/taltaf913/main-challenge-google"

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